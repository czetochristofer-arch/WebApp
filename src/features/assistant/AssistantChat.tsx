import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { collection, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref } from 'firebase/storage';
import {
  ArrowUp,
  AudioLines,
  CheckCircle2,
  CircleAlert,
  ImagePlus,
  Loader2,
  Mic,
  MicOff,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { auth, db, functions, storage } from '@/lib/firebase';
import { useLiveQuery } from '@/lib/hooks';
import { uploadPhoto } from '@/lib/db';
import { cx } from '@/components/ui';
import { ContactButtons } from '@/components/domain';
import { useFeedback } from '@/components/feedback';
import { Markdown } from './Markdown';
import { useDictation } from './speech';
import { loadVoicePrefs, Speaker, ttsSupported, unlockSpeech } from './tts';

interface Action {
  label: string;
  link?: string;
  status?: 'start' | 'done' | 'error';
  contact?: { phone: string; text: string };
}

type Chunk =
  | { type: 'thread'; threadId: string }
  | { type: 'text'; text: string }
  | { type: 'tool'; id: string; label: string; status: 'start' | 'done' | 'error'; link?: string; contact?: Action['contact'] }
  | { type: 'error'; message: string };

interface StoredMessage {
  id: string;
  seq: number;
  role: 'user' | 'assistant';
  text: string;
  hidden: boolean;
  actions: Action[];
  images?: string[];
}

interface Turn {
  key: string;
  role: 'user' | 'assistant';
  text: string;
  actions: (Action & { id?: string })[];
  images?: string[];
}

interface Attachment {
  id: string;
  preview: string;
  path?: string;
  error?: boolean;
}

const SUGGESTIONS = [
  'Čo mám dnes urobiť?',
  'Ktoré zákazky sú po termíne?',
  'Aké diely treba objednať?',
  'Ako sa nám darí tento mesiac oproti minulému?',
  'Nová zákazka: iPhone 13, rozbitý displej, Ján Novák 0905 123 456, hotové do piatku',
  'Napíš zákazníkom s hotovými zákazkami, že si môžu prísť',
];

type AgentInput = { threadId?: string; message: string; images?: string[]; voice?: boolean; appUrl: string };
const agentCall = () => httpsCallable<AgentInput, { threadId: string; text: string }, Chunk>(functions, 'agentChat', { timeout: 540_000 });

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
  const { toast } = useFeedback();
  const [threadId, setThreadId] = useState<string | undefined>(initialThread);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{
    user: string;
    images: string[];
    text: string;
    tools: Turn['actions'];
    error?: string;
    baseSeq: number;
    done?: boolean;
  } | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [readingKey, setReadingKey] = useState<string | null>(null);
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sentInitial = useRef(false);
  const voiceModeRef = useRef(false);
  voiceModeRef.current = voiceMode;
  const speakerRef = useRef<Speaker | null>(null);
  if (!speakerRef.current) speakerRef.current = new Speaker();
  const speaker = speakerRef.current;

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
        out.push({ key: m.id, role: 'user', text: m.text, actions: [], images: m.images });
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

  // Hlas: počas čítania ukazujeme tlačidlo Zastaviť; v hlasovom režime po dočítaní znova počúvame.
  const dictationRef = useRef<{ start: () => void } | null>(null);
  useEffect(() => {
    speaker.onChange = (s) => {
      setSpeaking(s);
      if (!s) setReadingKey(null);
    };
    speaker.onDone = () => {
      if (voiceModeRef.current) setTimeout(() => voiceModeRef.current && dictationRef.current?.start(), 250);
    };
    return () => speaker.cancel();
  }, [speaker]);

  const dictation = useDictation((text, final) => {
    if (voiceModeRef.current) {
      setVoiceText(text);
      if (final && text) send(text, { voice: true });
      return;
    }
    setInput(text);
    if (final && text) send(text, { voice: true });
  });
  dictationRef.current = dictation;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns.length, pending?.text, pending?.tools.length]);

  const addFiles = async (files: FileList | null) => {
    const uid = auth.currentUser?.uid;
    if (!files?.length || !uid) return;
    const room = 4 - attachments.length;
    if (room <= 0) return toast('Najviac 4 fotky naraz.', 'error');
    for (const file of Array.from(files).slice(0, room)) {
      const a: Attachment = { id: crypto.randomUUID(), preview: URL.createObjectURL(file) };
      setAttachments((list) => [...list, a]);
      uploadPhoto(`agent/${uid}`, file)
        .then((p) => setAttachments((list) => list.map((x) => (x.id === a.id ? { ...x, path: p.path } : x))))
        .catch(() => setAttachments((list) => list.map((x) => (x.id === a.id ? { ...x, error: true } : x))));
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const uploading = attachments.some((a) => !a.path && !a.error);

  const send = async (text: string, opts: { voice?: boolean } = {}) => {
    const ready = attachments.filter((a) => a.path);
    const message = text.trim() || (ready.length ? 'Pozri si priloženú fotku a pomôž mi s ňou.' : '');
    if (!message || busy || uploading) return;
    const prefs = loadVoicePrefs();
    const speak = ttsSupported() && ((opts.voice && (voiceModeRef.current || prefs.autoRead !== 'off')) || prefs.autoRead === 'always');
    setInput('');
    setVoiceText('');
    setAttachments([]);
    setBusy(true);
    setPending({ user: message, images: ready.map((a) => a.preview), text: '', tools: [], baseSeq: threadId ? maxSeq : 0 });
    if (speak) speaker.start();
    const controller = new AbortController();
    abortRef.current = controller;
    let acc = '';
    try {
      const payload: AgentInput = { message, appUrl: window.location.origin };
      if (threadId) payload.threadId = threadId;
      if (ready.length) payload.images = ready.map((a) => a.path!);
      if (opts.voice) payload.voice = true;
      const { stream, data } = await agentCall().stream(payload, { signal: controller.signal });
      // Chyba sa prejaví aj v streame; tu len zabránime neošetrenému odmietnutiu.
      data.catch(() => undefined);
      for await (const chunk of stream) {
        if (chunk.type === 'thread') {
          if (chunk.threadId !== threadId) {
            setThreadId(chunk.threadId);
            onThread?.(chunk.threadId);
          }
        } else if (chunk.type === 'text') {
          acc += chunk.text;
          setPending((p) => p && { ...p, text: p.text + chunk.text });
          if (speak) speaker.feed(acc);
        } else if (chunk.type === 'tool')
          setPending((p) => {
            if (!p) return p;
            const tools = p.tools.filter((t) => t.id !== chunk.id);
            return { ...p, tools: [...tools, { id: chunk.id, label: chunk.label, link: chunk.link, status: chunk.status, contact: chunk.contact }] };
          });
        else if (chunk.type === 'error') setPending((p) => p && { ...p, error: chunk.message });
      }
      await data;
      setPending((p) => p && { ...p, done: true });
      if (speak) speaker.feed(acc, true);
      else if (voiceModeRef.current) dictation.start();
    } catch (err) {
      speaker.cancel();
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

  const startDictation = () => {
    unlockSpeech();
    speaker.cancel();
    dictation.start();
  };

  const openVoiceMode = () => {
    unlockSpeech();
    speaker.cancel();
    setVoiceText('');
    setVoiceMode(true);
    dictation.start();
  };
  const closeVoiceMode = () => {
    setVoiceMode(false);
    dictation.abort();
    speaker.cancel();
  };

  const read = (key: string, text: string) => {
    if (readingKey === key) return speaker.cancel();
    unlockSpeech();
    speaker.say(text);
    setReadingKey(key);
  };

  const empty = turns.length === 0 && !pending;
  const phase = dictation.listening ? 'listening' : speaking ? 'speaking' : busy ? 'thinking' : 'idle';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className={cx('flex-1 overflow-y-auto', compact ? 'px-4 py-4' : 'px-1 py-2')}>
        {empty ? (
          <div className="mx-auto flex max-w-lg flex-col items-center py-8 text-center">
            <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
              <Sparkles className="size-6" />
            </div>
            <h2 className="text-lg font-semibold">Ako vám môžem pomôcť?</h2>
            <p className="mt-1 text-sm text-muted">
              Poznám vaše zákazky, objednávky, zákazníkov, kalendár aj tržby. Môžem ich aj zapisovať – stačí napísať, povedať alebo odfotiť.
            </p>
            {dictation.supported && (
              <button onClick={openVoiceMode} className="mt-5 flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-fg shadow-sm shadow-primary/30">
                <AudioLines className="size-4" /> Hovoriť s asistentom
              </button>
            )}
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
              <Bubble key={t.key} turn={t} reading={readingKey === t.key} onRead={() => read(t.key, t.text)} />
            ))}
            {pending && <Bubble turn={{ key: 'pending-user', role: 'user', text: pending.user, actions: [] }} previews={pending.images} />}
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

      {speaking && !voiceMode && (
        <div className="flex justify-center pb-2">
          <button onClick={() => speaker.cancel()} className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold shadow-sm">
            <Volume2 className="size-4 animate-pulse text-primary" /> Čítam odpoveď · Zastaviť
          </button>
        </div>
      )}

      <div className={cx('border-t border-line bg-surface', compact ? 'p-3' : 'rounded-2xl border p-2 shadow-sm')}>
        {dictation.error && <p className="px-2 pb-1 text-xs text-red-600">{dictation.error}</p>}
        {attachments.length > 0 && (
          <div className="flex gap-2 px-1 pb-2">
            {attachments.map((a) => (
              <div key={a.id} className="relative size-16 overflow-hidden rounded-xl border border-line bg-surface-2">
                <img src={a.preview} alt="" className={cx('size-full object-cover', !a.path && 'opacity-50')} />
                {!a.path && !a.error && <Loader2 className="absolute inset-0 m-auto size-5 animate-spin text-white drop-shadow" />}
                {a.error && <CircleAlert className="absolute inset-0 m-auto size-5 text-red-500" />}
                <button
                  type="button"
                  aria-label="Odstrániť fotku"
                  onClick={() => setAttachments((list) => list.filter((x) => x.id !== a.id))}
                  className="absolute top-0.5 right-0.5 rounded-full bg-black/60 p-0.5 text-white"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <form
          className="flex items-end gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Priložiť fotku"
            title="Priložiť fotku"
            className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface-2"
          >
            <ImagePlus className="size-5" />
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
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
            placeholder={dictation.listening ? 'Počúvam… (odošle sa, keď dohovoríte)' : 'Napíšte, povedzte alebo odfoťte…'}
            className="max-h-40 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-1.5 py-2.5 text-[15px] outline-none placeholder:text-subtle"
            style={{ height: Math.min(160, 44 + Math.max(0, input.split('\n').length - 1) * 22) }}
          />
          {dictation.supported && (
            <button
              type="button"
              onClick={dictation.listening ? dictation.stop : startDictation}
              aria-label={dictation.listening ? 'Dohovoril som – odoslať' : 'Povedať požiadavku'}
              title={dictation.listening ? 'Odoslať' : 'Povedať požiadavku (odpoveď sa prečíta nahlas)'}
              className={cx('flex size-11 shrink-0 items-center justify-center rounded-xl', dictation.listening ? 'animate-pulse bg-red-500 text-white' : 'text-muted hover:bg-surface-2')}
            >
              {dictation.listening ? <MicOff className="size-5" /> : <Mic className="size-5" />}
            </button>
          )}
          {busy ? (
            <button type="button" onClick={() => abortRef.current?.abort()} aria-label="Zastaviť" className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-fg text-bg">
              <Square className="size-4" />
            </button>
          ) : input.trim() || attachments.length || !dictation.supported ? (
            <button
              type="submit"
              disabled={(!input.trim() && !attachments.some((a) => a.path)) || uploading}
              aria-label="Odoslať"
              className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-fg disabled:opacity-40"
            >
              <ArrowUp className="size-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={openVoiceMode}
              aria-label="Hlasový rozhovor"
              title="Hlasový rozhovor – hovoríte a asistent odpovedá nahlas"
              className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-fg"
            >
              <AudioLines className="size-5" />
            </button>
          )}
        </form>
      </div>

      {voiceMode && (
        <VoiceOverlay
          phase={phase}
          transcript={voiceText}
          reply={pending?.text ?? turns[turns.length - 1]?.text ?? ''}
          error={dictation.error ?? pending?.error}
          onClose={closeVoiceMode}
          onOrb={() => {
            if (phase === 'listening') dictation.stop();
            else if (phase === 'speaking') {
              speaker.cancel();
              dictation.start();
            } else if (phase === 'idle') dictation.start();
          }}
        />
      )}
    </div>
  );
}

function VoiceOverlay({
  phase,
  transcript,
  reply,
  error,
  onClose,
  onOrb,
}: {
  phase: 'listening' | 'speaking' | 'thinking' | 'idle';
  transcript: string;
  reply: string;
  error?: string | null;
  onClose: () => void;
  onOrb: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const label = { listening: 'Počúvam…', speaking: 'Odpovedám', thinking: 'Premýšľam…', idle: 'Ťuknite a hovorte' }[phase];
  const shown = phase === 'listening' || phase === 'idle' ? transcript : reply;
  return createPortal(
    <div className="animate-fade-in fixed inset-0 z-[60] flex flex-col bg-bg/95 backdrop-blur-md" role="dialog" aria-label="Hlasový rozhovor">
      <div className="pt-safe flex items-center justify-between px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-muted">
          <Sparkles className="size-4 text-primary" /> Hlasový rozhovor
        </span>
        <button onClick={onClose} aria-label="Ukončiť hlasový rozhovor" className="flex size-10 items-center justify-center rounded-xl hover:bg-surface-2">
          <X className="size-5" />
        </button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6">
        <button onClick={onOrb} aria-label={label} className="relative flex size-40 items-center justify-center">
          {phase === 'listening' && <span className="absolute inset-0 animate-ping rounded-full bg-primary/25" />}
          {phase === 'speaking' && <span className="absolute inset-[-12px] animate-pulse rounded-full bg-primary/20" />}
          <span
            className={cx(
              'relative flex size-36 items-center justify-center rounded-full text-primary-fg shadow-2xl transition-all duration-300',
              phase === 'idle' ? 'bg-surface-2 text-muted shadow-none' : 'bg-primary shadow-primary/40',
              phase === 'thinking' && 'scale-90',
            )}
          >
            {phase === 'listening' ? (
              <Mic className="size-12" />
            ) : phase === 'speaking' ? (
              <Volume2 className="size-12" />
            ) : phase === 'thinking' ? (
              <Loader2 className="size-12 animate-spin" />
            ) : (
              <Mic className="size-12" />
            )}
          </span>
        </button>
        <div className="text-center">
          <p className="text-xl font-bold">{label}</p>
          <p className="mx-auto mt-3 line-clamp-6 min-h-12 max-w-md text-[15px] leading-relaxed text-muted">{error || shown}</p>
        </div>
      </div>
      <p className="pb-safe px-6 pb-6 text-center text-xs text-subtle">
        {phase === 'speaking' ? 'Ťuknite na kruh a skočte asistentovi do reči.' : phase === 'listening' ? 'Keď dohovoríte, požiadavka sa odošle sama.' : 'Asistent vie zákazky, objednávky, kalendár aj tržby.'}
      </p>
    </div>,
    document.body,
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
  const chips = actions.filter((a) => !(a.contact && a.status !== 'start'));
  const messages = actions.filter((a) => a.contact && a.status !== 'start');
  return (
    <div className="space-y-2">
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((a, i) => {
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
      )}
      {messages.map((a, i) => (
        <div key={i} className="rounded-2xl border border-line bg-surface p-3">
          <p className="mb-1 text-xs font-semibold text-muted">{a.label}</p>
          <p className="mb-2.5 text-sm whitespace-pre-wrap">{a.contact!.text}</p>
          <ContactButtons phone={a.contact!.phone} message={a.contact!.text} compact />
        </div>
      ))}
    </div>
  );
}

const urlCache = new Map<string, Promise<string>>();
function StorageImage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!urlCache.has(path)) urlCache.set(path, getDownloadURL(ref(storage, path)));
    urlCache
      .get(path)!
      .then((u) => alive && setUrl(u))
      .catch(() => urlCache.delete(path));
    return () => {
      alive = false;
    };
  }, [path]);
  return url ? (
    <a href={url} target="_blank" rel="noreferrer">
      <img src={url} alt="Priložená fotka" className="size-24 rounded-xl object-cover" />
    </a>
  ) : (
    <span className="block size-24 rounded-xl bg-white/20" />
  );
}

function Bubble({ turn, previews, reading, onRead }: { turn: Turn; previews?: string[]; reading?: boolean; onRead?: () => void }) {
  if (turn.role === 'user') {
    const hasImages = !!(previews?.length || turn.images?.length);
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[15px] whitespace-pre-wrap text-primary-fg">
          {hasImages && (
            <div className="mb-2 flex flex-wrap justify-end gap-1.5">
              {previews?.map((p) => <img key={p} src={p} alt="" className="size-24 rounded-xl object-cover" />)}
              {turn.images?.map((p) => <StorageImage key={p} path={p} />)}
            </div>
          )}
          {turn.text}
        </div>
      </div>
    );
  }
  return (
    <div className="group flex gap-3">
      <AssistantAvatar />
      <div className="min-w-0 flex-1 space-y-2">
        {turn.actions.length > 0 && <ActionList actions={turn.actions} />}
        {turn.text && <Markdown text={turn.text} />}
        {turn.text && onRead && ttsSupported() && (
          <button
            onClick={onRead}
            className={cx(
              'flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-xs font-medium transition-opacity hover:bg-surface-2',
              reading ? 'text-primary' : 'text-subtle opacity-100 sm:opacity-0 sm:group-hover:opacity-100',
            )}
          >
            {reading ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
            {reading ? 'Zastaviť' : 'Prečítať'}
          </button>
        )}
      </div>
    </div>
  );
}
