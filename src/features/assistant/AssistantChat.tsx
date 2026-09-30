import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { ArrowUp, CheckCircle2, CircleAlert, Loader2, Mic, MicOff, Sparkles, Square } from 'lucide-react';
import { db, functions } from '@/lib/firebase';
import { useLiveQuery } from '@/lib/hooks';
import { cx } from '@/components/ui';
import { Markdown } from './Markdown';
import { useDictation } from './speech';

type Chunk =
  | { type: 'thread'; threadId: string }
  | { type: 'text'; text: string }
  | { type: 'tool'; id: string; label: string; status: 'start' | 'done' | 'error'; link?: string }
  | { type: 'error'; message: string };

interface StoredMessage {
  id: string;
  seq: number;
  role: 'user' | 'assistant';
  text: string;
  hidden: boolean;
  actions: { label: string; link?: string }[];
}

interface Turn {
  key: string;
  role: 'user' | 'assistant';
  text: string;
  actions: { label: string; link?: string; status?: 'start' | 'done' | 'error' }[];
}

const SUGGESTIONS = [
  'Čo mám dnes urobiť?',
  'Ktoré zákazky sú po termíne?',
  'Aké diely treba objednať?',
  'Ako sa nám darí tento mesiac oproti minulému?',
  'Nová zákazka: iPhone 13, rozbitý displej, Ján Novák 0905 123 456, hotové do piatku',
  'Objednávka: ochranné sklo na Samsung S24 pre p. Kováčovú',
];

const agentCall = () => httpsCallable<{ threadId?: string; message: string }, { threadId: string; text: string }, Chunk>(functions, 'agentChat', { timeout: 540_000 });

export function AssistantChat({
  threadId: initialThread,
  initialPrompt,
  compact,
  onThread,
}: {
  threadId?: string;
  initialPrompt?: string;
  compact?: boolean;
  onThread?: (id: string) => void;
}) {
  const [threadId, setThreadId] = useState<string | undefined>(initialThread);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ user: string; text: string; tools: Turn['actions']; error?: string; baseSeq: number; done?: boolean } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sentInitial = useRef(false);

  useEffect(() => setThreadId(initialThread), [initialThread]);

  const stored = useLiveQuery<StoredMessage>(
    () => (threadId ? query(collection(db, 'agentThreads', threadId, 'messages'), orderBy('seq')) : null),
    `thread-${threadId ?? 'new'}`,
  );

  // Zlúčime uložené správy do "ťahov": správa používateľa + celá odpoveď asistenta (aj cez viac krokov s nástrojmi).
  const maxSeq = stored.data.reduce((m, x) => Math.max(m, x.seq), 0);
  const turns = useMemo<Turn[]>(() => {
    const out: Turn[] = [];
    // Počas odpovede zobrazujeme priebeh zo streamu; nové uložené správy ukážeme až po dokončení.
    const visible = pending ? stored.data.filter((m) => m.seq <= pending.baseSeq) : stored.data;
    for (const m of visible) {
      if (m.role === 'user' && !m.hidden) {
        out.push({ key: m.id, role: 'user', text: m.text, actions: [] });
        continue;
      }
      let last = out[out.length - 1];
      if (!last || last.role !== 'assistant') {
        last = { key: m.id, role: 'assistant', text: '', actions: [] };
        out.push(last);
      }
      if (m.role === 'assistant' && m.text) last.text += (last.text ? '\n\n' : '') + m.text;
      last.actions.push(...(m.actions ?? []));
    }
    return out;
  }, [stored.data, pending]);

  // Po dokončení počkáme, kým sa odpoveď objaví v uložených správach, a až potom skryjeme priebeh.
  useEffect(() => {
    if (!pending?.done || pending.error) return;
    const last = stored.data[stored.data.length - 1];
    if (maxSeq > pending.baseSeq + 1 && last?.role === 'assistant') {
      setPending(null);
      return;
    }
    const t = setTimeout(() => setPending(null), 4000);
    return () => clearTimeout(t);
  }, [pending, stored.data, maxSeq]);

  const dictation = useDictation((text, final) => {
    setInput(text);
    if (final) inputRef.current?.focus();
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns.length, pending?.text, pending?.tools.length]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setInput('');
    setBusy(true);
    setPending({ user: message, text: '', tools: [], baseSeq: threadId ? maxSeq : 0 });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const { stream, data } = await agentCall().stream(threadId ? { threadId, message } : { message }, { signal: controller.signal });
      // Chyba sa prejaví aj v streame; tu len zabránime neošetrenému odmietnutiu.
      data.catch(() => undefined);
      for await (const chunk of stream) {
        if (chunk.type === 'thread') {
          if (chunk.threadId !== threadId) {
            setThreadId(chunk.threadId);
            onThread?.(chunk.threadId);
          }
        } else if (chunk.type === 'text') setPending((p) => p && { ...p, text: p.text + chunk.text });
        else if (chunk.type === 'tool')
          setPending((p) => {
            if (!p) return p;
            const tools = p.tools.filter((t) => (t as { id?: string }).id !== chunk.id);
            return { ...p, tools: [...tools, { id: chunk.id, label: chunk.label, link: chunk.link, status: chunk.status } as Turn['actions'][number]] };
          });
        else if (chunk.type === 'error') setPending((p) => p && { ...p, error: chunk.message });
      }
      await data;
      setPending((p) => p && { ...p, done: true });
    } catch (err) {
      if (controller.signal.aborted) setPending(null);
      else {
        const msg = err instanceof Error ? err.message : String(err);
        setPending((p) => p && { ...p, error: /internal|unavailable|deadline/i.test(msg) ? 'Asistent je momentálne nedostupný. Skúste to znova.' : msg });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  useEffect(() => {
    if (initialPrompt && !sentInitial.current) {
      sentInitial.current = true;
      if (initialPrompt.endsWith(': ') || initialPrompt.endsWith(' ')) {
        setInput(initialPrompt);
        setTimeout(() => inputRef.current?.focus(), 50);
      } else send(initialPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  const empty = turns.length === 0 && !pending;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className={cx('flex-1 overflow-y-auto', compact ? 'px-4 py-4' : 'px-1 py-2')}>
        {empty ? (
          <div className="mx-auto flex max-w-lg flex-col items-center py-8 text-center">
            <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
              <Sparkles className="size-6" />
            </div>
            <h2 className="text-lg font-semibold">Ako vám môžem pomôcť?</h2>
            <p className="mt-1 text-sm text-muted">Poznám vaše zákazky, objednávky, zákazníkov, kalendár aj tržby. Môžem ich aj zapisovať – stačí napísať alebo nadiktovať.</p>
            <div className="mt-5 grid w-full gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-xl border border-line bg-surface px-3 py-2.5 text-left text-sm hover:border-primary/50">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4">
            {turns.map((t) => (
              <Bubble key={t.key} turn={t} />
            ))}
            {pending && <Bubble turn={{ key: 'pending-user', role: 'user', text: pending.user, actions: [] }} />}
            {pending && (
              <div className="flex gap-3">
                <AssistantAvatar />
                <div className="min-w-0 flex-1 space-y-2">
                  {pending.tools.length > 0 && <ActionList actions={pending.tools} />}
                  {pending.text ? (
                    <Markdown text={pending.text} />
                  ) : (
                    !pending.error && (
                      <div className="flex items-center gap-2 text-sm text-muted">
                        <Loader2 className="size-4 animate-spin" /> Premýšľam…
                      </div>
                    )
                  )}
                  {pending.error && (
                    <p className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
                      <CircleAlert className="size-4 shrink-0" /> {pending.error}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className={cx('border-t border-line bg-surface', compact ? 'p-3' : 'rounded-2xl border p-2 shadow-sm')}>
        {dictation.error && <p className="px-2 pb-1 text-xs text-red-600">{dictation.error}</p>}
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder={dictation.listening ? 'Počúvam…' : 'Napíšte alebo nadiktujte požiadavku…'}
            className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-[15px] outline-none placeholder:text-subtle"
            style={{ height: Math.min(160, 44 + Math.max(0, input.split('\n').length - 1) * 22) }}
          />
          {dictation.supported && (
            <button
              type="button"
              onClick={dictation.listening ? dictation.stop : dictation.start}
              aria-label={dictation.listening ? 'Zastaviť diktovanie' : 'Diktovať'}
              className={cx('flex size-11 shrink-0 items-center justify-center rounded-xl', dictation.listening ? 'animate-pulse bg-red-500 text-white' : 'text-muted hover:bg-surface-2')}
            >
              {dictation.listening ? <MicOff className="size-5" /> : <Mic className="size-5" />}
            </button>
          )}
          {busy ? (
            <button type="button" onClick={() => abortRef.current?.abort()} aria-label="Zastaviť" className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-fg text-bg">
              <Square className="size-4" />
            </button>
          ) : (
            <button type="submit" disabled={!input.trim()} aria-label="Odoslať" className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-fg disabled:opacity-40">
              <ArrowUp className="size-5" />
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

function AssistantAvatar() {
  return (
    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
      <Sparkles className="size-4" />
    </span>
  );
}

function ActionList({ actions }: { actions: Turn['actions'] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {actions.map((a, i) => {
        const icon =
          a.status === 'start' ? <Loader2 className="size-3.5 animate-spin" /> : a.status === 'error' ? <CircleAlert className="size-3.5 text-red-500" /> : <CheckCircle2 className="size-3.5 text-emerald-500" />;
        const cls = 'inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium';
        return a.link && a.status !== 'start' ? (
          <Link key={i} to={a.link} className={cx(cls, 'hover:border-primary/50 hover:text-primary')}>
            {icon}
            {a.label}
          </Link>
        ) : (
          <span key={i} className={cx(cls, 'text-muted')}>
            {icon}
            {a.label}
          </span>
        );
      })}
    </div>
  );
}

function Bubble({ turn }: { turn: Turn }) {
  if (turn.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[15px] whitespace-pre-wrap text-primary-fg">{turn.text}</div>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <AssistantAvatar />
      <div className="min-w-0 flex-1 space-y-2">
        {turn.actions.length > 0 && <ActionList actions={turn.actions} />}
        {turn.text && <Markdown text={turn.text} />}
      </div>
    </div>
  );
}
