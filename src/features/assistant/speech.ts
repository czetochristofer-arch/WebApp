import { useCallback, useEffect, useRef, useState } from 'react';

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

function getCtor(): (new () => Recognition) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Diktovanie (slovenčina). Funguje v Chrome, Edge a Safari.
 * Keď používateľ prestane hovoriť (`silenceMs`), počúvanie sa samo ukončí a zavolá `onText(text, true)`.
 */
export function useDictation(onText: (text: string, final: boolean) => void, { silenceMs = 1600 }: { silenceMs?: number } = {}) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Recognition | null>(null);
  const cbRef = useRef(onText);
  cbRef.current = onText;
  const supported = typeof window !== 'undefined' && !!getCtor();

  useEffect(() => () => recRef.current?.abort(), []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor || recRef.current) return;
    const rec = new Ctor();
    rec.lang = 'sk-SK';
    rec.continuous = true;
    rec.interimResults = true;
    let finalText = '';
    let latest = '';
    let silence: ReturnType<typeof setTimeout> | undefined;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      latest = (finalText + interim).trim();
      cbRef.current(latest, false);
      clearTimeout(silence);
      silence = setTimeout(() => rec.stop(), silenceMs);
    };
    rec.onerror = (e) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') setError(e.error === 'not-allowed' ? 'Povoľte prístup k mikrofónu.' : 'Rozpoznávanie reči zlyhalo.');
    };
    rec.onend = () => {
      clearTimeout(silence);
      recRef.current = null;
      setListening(false);
      // Safari niekedy neoznačí poslednú časť ako hotovú – použijeme aj priebežný text.
      cbRef.current((finalText.trim() || latest).trim(), true);
    };
    setError(null);
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      recRef.current = null;
    }
  }, [silenceMs]);

  const stop = useCallback(() => recRef.current?.stop(), []);
  /** Zruší počúvanie bez odoslania textu. */
  const abort = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
    };
    rec.abort();
  }, []);
  return { supported, listening, error, start, stop, abort };
}
