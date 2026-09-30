import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { DocumentReference } from 'firebase-admin/firestore';
import { db, FieldValue, getSettings } from '../lib/store.js';
import { nowDescription } from '../lib/time.js';
import { systemPrompt } from './prompt.js';
import { toolByName, TOOLS, type ToolContext } from './tools.js';

export const MODEL = process.env.AGENT_MODEL || 'claude-sonnet-5-5';
const MAX_ITERATIONS = 14;

export type AgentChunk =
  | { type: 'thread'; threadId: string }
  | { type: 'text'; text: string }
  | { type: 'tool'; id: string; label: string; status: 'start' | 'done' | 'error'; link?: string; result?: string }
  | { type: 'error'; message: string };

type Beta = Anthropic.Beta.BetaMessageParam;
type BetaContent = Anthropic.Beta.BetaContentBlockParam;

function jsonSchema(schema: z.ZodType) {
  const s = z.toJSONSchema(schema, { io: 'input' }) as Record<string, unknown>;
  delete s.$schema;
  return s as Anthropic.Beta.BetaTool['input_schema'];
}

const TOOL_DEFS: Anthropic.Beta.BetaToolUnion[] = [
  ...TOOLS.map(
    (t): Anthropic.Beta.BetaTool => ({
      name: t.name,
      description: t.description,
      input_schema: jsonSchema(t.schema),
      eager_input_streaming: true,
    }),
  ),
  {
    type: 'web_search_20260209',
    name: 'web_search',
    max_uses: 5,
    user_location: { type: 'approximate', timezone: 'Europe/Bratislava' },
  },
];

interface StoredMessage {
  seq: number;
  role: 'user' | 'assistant';
  content: string;
}

/** Stav konverzácie je len pripájaný (append-only) – nič sa spätne neprepisuje. */
async function appendMessage(
  thread: DocumentReference,
  seq: number,
  role: 'user' | 'assistant',
  content: unknown,
  display: { text?: string; hidden?: boolean; actions?: { label: string; link?: string }[] },
) {
  await thread
    .collection('messages')
    .doc(String(seq).padStart(6, '0'))
    .set({
      seq,
      role,
      content: JSON.stringify(content),
      text: display.text ?? '',
      hidden: !!display.hidden,
      actions: display.actions ?? [],
      createdAt: FieldValue.serverTimestamp(),
    });
}

export async function runAgent(opts: {
  apiKey: string;
  uid: string;
  actor: string;
  threadId?: string;
  message: string;
  send: (chunk: AgentChunk) => void;
  signal?: AbortSignal;
}): Promise<{ threadId: string; text: string }> {
  const { send } = opts;
  const client = new Anthropic({ apiKey: opts.apiKey });
  const settings = await getSettings();
  const ctx: ToolContext = { actor: opts.actor, settings };

  // Konverzácia
  const threads = db().collection('agentThreads');
  let thread: DocumentReference;
  let messages: Beta[] = [];
  let seq = 0;
  // Systémový prompt sa pre konverzáciu zafixuje pri jej vzniku: história musí ostať nezmenená
  // (aj keď sa neskôr zmenia údaje firmy), inak by model zahodil svoje predchádzajúce úvahy.
  let system = systemPrompt(settings);
  if (opts.threadId) {
    thread = threads.doc(opts.threadId);
    const snap = await thread.get();
    if (!snap.exists || snap.data()!.uid !== opts.uid) throw new Error('Konverzácia neexistuje.');
    if (typeof snap.data()!.system === 'string') system = snap.data()!.system;
    const stored = await thread.collection('messages').orderBy('seq').get();
    messages = stored.docs.map((d) => {
      const m = d.data() as StoredMessage;
      seq = Math.max(seq, m.seq);
      return { role: m.role, content: JSON.parse(m.content) } as Beta;
    });
    await thread.update({ updatedAt: FieldValue.serverTimestamp() });
  } else {
    thread = threads.doc();
    await thread.set({
      uid: opts.uid,
      system,
      title: opts.message.slice(0, 80),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  send({ type: 'thread', threadId: thread.id });

  const userContent: BetaContent[] = [{ type: 'text', text: `<kontext>Aktuálny dátum a čas: ${nowDescription()}. Používateľ: ${opts.actor}.</kontext>\n\n${opts.message}` }];
  messages.push({ role: 'user', content: userContent });
  await appendMessage(thread, ++seq, 'user', userContent, { text: opts.message });

  let finalText = '';
  let pendingActions: { label: string; link?: string }[] = [];

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    if (opts.signal?.aborted) break;
    const stream = client.beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 64000,
        system,
        tools: TOOL_DEFS,
        messages,
        // Ak by sa po aktualizácii aplikácie zmenil zoznam nástrojov, staré úvahy modelu sa
        // v starších konverzáciách jednoducho vynechajú namiesto chyby.
        thinking: { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } },
        output_config: { effort: 'medium' },
        cache_control: { type: 'ephemeral' },
        betas: ['server-side-fallback-2026-07-01', 'thinking-binding-controls-2026-08-01'],
        fallbacks: 'default',
      },
      { signal: opts.signal },
    );
    // Text z ďalšieho kroku (po použití nástroja) oddelíme od predchádzajúceho novým odsekom.
    let separated = !finalText;
    stream.on('text', (delta) => {
      if (!separated) {
        separated = true;
        send({ type: 'text', text: '\n\n' });
      }
      send({ type: 'text', text: delta });
    });

    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await stream.finalMessage();
    } catch (err) {
      if (err instanceof Anthropic.APIError) throw err;
      // Vstup nástroja sa nepodarilo rozparsovať – zopakujeme krok.
      console.warn('agent: nepodarilo sa spracovať vstup nástroja, opakujem', err);
      continue;
    }

    const text = message.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    if (text) finalText += (finalText ? '\n\n' : '') + text;
    messages.push({ role: 'assistant', content: message.content as BetaContent[] });
    await appendMessage(thread, ++seq, 'assistant', message.content, { text, actions: pendingActions });
    pendingActions = [];

    if (message.stop_reason === 'refusal') {
      send({ type: 'error', message: 'Túto požiadavku asistent nemôže spracovať.' });
      break;
    }
    if (message.stop_reason === 'pause_turn') continue;

    const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    if (!toolUses.length) break;
    if (message.stop_reason === 'max_tokens') {
      send({ type: 'error', message: 'Odpoveď bola príliš dlhá – skúste požiadavku rozdeliť.' });
      break;
    }

    // Nástroje v jednej odpovedi spúšťame súbežne a výsledky vraciame v jednej správe.
    const results = await Promise.all(
      toolUses.map(async (use): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
        const def = toolByName.get(use.name);
        if (!def) return { type: 'tool_result', tool_use_id: use.id, is_error: true, content: `Neznámy nástroj ${use.name}` };
        const parsed = def.schema.safeParse(use.input);
        if (!parsed.success) {
          return { type: 'tool_result', tool_use_id: use.id, is_error: true, content: `Neplatný vstup: ${parsed.error.message}` };
        }
        const label = (def.label as (i: unknown) => string)(parsed.data);
        send({ type: 'tool', id: use.id, label, status: 'start' });
        try {
          const outcome = await (def.run as (i: unknown, c: ToolContext) => Promise<{ result: unknown; action?: { label: string; link?: string } }>)(parsed.data, ctx);
          if (outcome.action) pendingActions.push(outcome.action);
          send({ type: 'tool', id: use.id, label: outcome.action?.label ?? label, status: 'done', link: outcome.action?.link });
          return { type: 'tool_result', tool_use_id: use.id, content: JSON.stringify(outcome.result) };
        } catch (err) {
          console.error('agent tool', use.name, err);
          send({ type: 'tool', id: use.id, label, status: 'error' });
          return { type: 'tool_result', tool_use_id: use.id, is_error: true, content: `Chyba: ${err instanceof Error ? err.message : String(err)}` };
        }
      }),
    );
    messages.push({ role: 'user', content: results });
    await appendMessage(thread, ++seq, 'user', results, { hidden: true });
  }

  await thread.update({ updatedAt: FieldValue.serverTimestamp(), lastText: finalText.slice(0, 200) });
  return { threadId: thread.id, text: finalText };
}
