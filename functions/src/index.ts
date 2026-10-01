import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { db, FieldValue } from './lib/store.js';
import { runAgent, type AgentChunk } from './agent/run.js';
import { publicRepairStatus } from './public.js';

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

/** Verejný stav opravy pre zákazníka – bez prihlásenia (QR kód na protokole, odkaz v SMS). */
export const repairStatus = onCall({ concurrency: 40, memory: '256MiB' }, async (req) => {
  const id = z.string().regex(/^[A-Za-z0-9]{10,40}$/).safeParse((req.data as { id?: unknown } | null)?.id);
  if (!id.success) throw new HttpsError('invalid-argument', 'Neplatný odkaz.');
  const status = await publicRepairStatus(id.data);
  if (!status) throw new HttpsError('not-found', 'Zákazka sa nenašla.');
  return status;
});

const AgentInput = z.object({
  threadId: z.string().min(1).max(100).nullish(),
  message: z.string().trim().min(1).max(8000),
  /** Cesty k fotkám v úložisku (agent/{uid}/…), ktoré používateľ priložil. */
  images: z.array(z.string().regex(/^agent\/[A-Za-z0-9]+\/[\w.-]+$/)).max(4).nullish(),
  /** Požiadavka zadaná hlasom – odpoveď sa bude čítať nahlas. */
  voice: z.boolean().nullish(),
  appUrl: z.string().regex(/^https?:\/\/[^/\s]+$/).max(200).nullish(),
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

    const images = input.data.images ?? [];
    if (images.some((p) => !p.startsWith(`agent/${req.auth!.uid}/`))) throw new HttpsError('permission-denied', 'Neplatná fotka.');

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
        images,
        voice: !!input.data.voice,
        appUrl: input.data.appUrl ?? undefined,
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
