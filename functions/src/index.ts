import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { db, FieldValue } from './lib/store.js';
import { runAgent, type AgentChunk } from './agent/run.js';

initializeApp();
setGlobalOptions({ region: 'europe-west1', maxInstances: 5 });

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
/** E-mail(y) majiteľa oddelené čiarkou – uložené ako tajomstvo, aby neboli v kóde. */
const OWNER_EMAILS = defineSecret('OWNER_EMAILS');

/**
 * Po prihlásení overí, či je používateľ majiteľ alebo pozvaný člen, a vytvorí mu členstvo.
 * Bez členstva pravidlá databázy nepustia k žiadnym dátam.
 */
export const joinWorkspace = onCall({ secrets: [OWNER_EMAILS] }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Najprv sa prihláste.');
  const uid = req.auth.uid;
  const memberRef = db().doc(`members/${uid}`);
  const existing = await memberRef.get();
  if (existing.exists) return { role: existing.data()!.role };

  const email = String(req.auth.token.email ?? '').toLowerCase();
  if (!email || req.auth.token.email_verified !== true) {
    throw new HttpsError('permission-denied', 'E-mail účtu nie je overený.');
  }
  const owners = OWNER_EMAILS.value()
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  let role: 'owner' | 'staff' | null = owners.includes(email) ? 'owner' : null;
  if (!role) {
    const invite = await db().doc(`invites/${email}`).get();
    if (invite.exists) {
      role = invite.data()!.role === 'owner' ? 'owner' : 'staff';
      await invite.ref.delete();
    }
  }
  if (!role) throw new HttpsError('permission-denied', 'Tento účet nemá pozvánku do tímu.');

  const user = await getAuth().getUser(uid);
  await memberRef.set({ email, name: user.displayName ?? '', role, createdAt: FieldValue.serverTimestamp() });
  const settings = db().doc('settings/business');
  if (!(await settings.get()).exists) await settings.set({ name: 'ChrisStop', createdAt: FieldValue.serverTimestamp() });
  return { role };
});

const AgentInput = z.object({
  threadId: z.string().min(1).max(100).nullish(),
  message: z.string().trim().min(1).max(8000),
});

/** AI asistent (Claude) – odpoveď sa posiela postupne (streaming). */
export const agentChat = onCall<z.infer<typeof AgentInput>, Promise<{ threadId: string; text: string }>, AgentChunk>(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 540, memory: '512MiB', concurrency: 20 },
  async (req, res) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Najprv sa prihláste.');
    const member = await db().doc(`members/${req.auth.uid}`).get();
    if (!member.exists) throw new HttpsError('permission-denied', 'Nemáte prístup.');
    const input = AgentInput.safeParse(req.data);
    if (!input.success) throw new HttpsError('invalid-argument', 'Neplatná požiadavka.');

    const m = member.data()!;
    const actor = `AI asistent (${m.name || m.email})`;
    const send = (chunk: AgentChunk) => {
      void res?.sendChunk(chunk);
    };
    try {
      return await runAgent({
        apiKey: ANTHROPIC_API_KEY.value(),
        uid: req.auth.uid,
        actor,
        threadId: input.data.threadId ?? undefined,
        message: input.data.message,
        send,
        signal: res?.signal,
      });
    } catch (err) {
      console.error('agentChat', err);
      if (err instanceof Anthropic.AuthenticationError) throw new HttpsError('failed-precondition', 'AI asistent nemá platný API kľúč.');
      if (err instanceof Anthropic.RateLimitError) throw new HttpsError('resource-exhausted', 'AI asistent je momentálne preťažený, skúste to o chvíľu.');
      if (err instanceof Anthropic.APIError) throw new HttpsError('unavailable', `AI služba vrátila chybu (${err.status}).`);
      throw new HttpsError('internal', err instanceof Error ? err.message : 'Neznáma chyba');
    }
  },
);
