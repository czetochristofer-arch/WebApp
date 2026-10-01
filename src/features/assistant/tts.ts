import { useEffect, useState } from 'react';

/** Nastavenia hlasu sú uložené v zariadení – každé zariadenie má iné hlasy. */
export interface VoicePrefs {
  voiceURI?: string;
  rate: number;
  /** Kedy čítať odpovede nahlas: len keď používateľ hovoril / vždy / nikdy. */
  autoRead: 'voice' | 'always' | 'off';
}

const KEY = 'cs-voice';
const DEFAULTS: VoicePrefs = { rate: 1.05, autoRead: 'voice' };

export function loadVoicePrefs(): VoicePrefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return DEFAULTS;
  }
}

export function saveVoicePrefs(p: VoicePrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Súkromné okno – nastavenie platí len do zatvorenia.
  }
}

export const ttsSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

/** Slovenské hlasy (prípadne české ako náhrada), najkvalitnejšie navrchu. */
export function rankVoices(all: SpeechSynthesisVoice[]) {
  const score = (v: SpeechSynthesisVoice) => {
    const lang = v.lang.toLowerCase();
    let s = lang.startsWith('sk') ? 100 : lang.startsWith('cs') ? 40 : 0;
    if (/natural|neural|online|premium|enhanced|vylepšen/i.test(v.name)) s += 20;
    if (/google/i.test(v.name)) s += 10;
    if (v.localService) s += 2;
    return s;
  };
  return all.filter((v) => score(v) >= 40).sort((a, b) => score(b) - score(a));
}

export function useVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => (ttsSupported() ? rankVoices(speechSynthesis.getVoices()) : []));
  useEffect(() => {
    if (!ttsSupported()) return;
    const update = () => setVoices(rankVoices(speechSynthesis.getVoices()));
    update();
    speechSynthesis.addEventListener('voiceschanged', update);
    return () => speechSynthesis.removeEventListener('voiceschanged', update);
  }, []);
  return voices;
}

function pickVoice(prefs: VoicePrefs) {
  const voices = rankVoices(speechSynthesis.getVoices());
  return voices.find((v) => v.voiceURI === prefs.voiceURI) ?? voices[0] ?? null;
}

/** Prevedie odpoveď (markdown) na text vhodný na čítanie nahlas. */
export function toSpeech(md: string) {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'odkaz')
    .split('\n')
    .map((line) => {
      const l = line.trim();
      if (/^\|?\s*:?-{2,}/.test(l)) return '';
      if (l.startsWith('|')) return l.split('|').map((c) => c.trim()).filter(Boolean).join(', ') + '.';
      const item = l.replace(/^(#{1,6}\s+|[-*•]\s+|\d+[.)]\s+)/, '');
      return item && item !== l && !/[.!?:;,]$/.test(item) ? `${item}.` : item;
    })
    .join('\n')
    .replace(/[*_~#>]+/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\b([A-Z]{1,3})-(\d{2,})\b/g, '$1 $2')
    .replace(/(\d)\s*€/g, '$1 eur')
    .replace(/€/g, 'eur')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** Koniec vety: interpunkcia, za ktorou ide nová veta (veľké písmeno), alebo nový riadok. Dátumy „3. 10.“ nedelí. */
const BOUNDARY = /[.!?…:](?=\s+[A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ„"(])|\n/g;

function sentences(text: string) {
  return text
    .split(/(?<=[.!?…])\s+(?=[A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ„"(])|\n+/)
    .map((s) => s.trim())
    .filter((s) => /[\p{L}\p{N}]/u.test(s));
}

/**
 * Číta odpoveď nahlas po vetách už počas jej prichádzania (rýchla reakcia, bez prerušenia dlhých textov v Chrome).
 */
export class Speaker {
  private consumed = 0;
  private queue: string[] = [];
  private speaking = false;
  private active = false;
  private finished = false;
  onChange?: (speaking: boolean) => void;
  /** Zavolá sa, keď je odpoveď celá prečítaná. */
  onDone?: () => void;

  /** Začne čítať novú odpoveď. */
  start() {
    this.cancel();
    this.active = true;
    this.finished = false;
    this.consumed = 0;
  }

  /** Priebežný text odpovede; prečíta hotové vety. `final` = odpoveď je kompletná. */
  feed(full: string, final = false) {
    if (!this.active || !ttsSupported()) return;
    const rest = full.slice(this.consumed);
    let cut = final ? rest.length : 0;
    if (!final) {
      BOUNDARY.lastIndex = 0;
      for (let m = BOUNDARY.exec(rest); m; m = BOUNDARY.exec(rest)) cut = m.index + 1;
    }
    if (cut > 0) {
      this.consumed += cut;
      this.queue.push(...sentences(toSpeech(rest.slice(0, cut))));
    }
    if (final) this.finished = true;
    this.pump();
  }

  /** Prečíta celý text (napr. staršiu odpoveď). */
  say(text: string) {
    this.start();
    this.feed(text, true);
  }

  private pump() {
    if (this.speaking || !this.active) return;
    const next = this.queue.shift();
    if (!next) {
      if (this.finished) {
        this.active = false;
        this.onChange?.(false);
        this.onDone?.();
      }
      return;
    }
    const prefs = loadVoicePrefs();
    const voice = pickVoice(prefs);
    const u = new SpeechSynthesisUtterance(next);
    u.lang = voice?.lang ?? 'sk-SK';
    if (voice) u.voice = voice;
    u.rate = prefs.rate;
    const done = () => {
      if (!this.speaking) return;
      this.speaking = false;
      this.pump();
    };
    u.onend = done;
    u.onerror = done;
    this.speaking = true;
    this.onChange?.(true);
    speechSynthesis.speak(u);
  }

  /** Zastaví čítanie bez volania onDone. */
  cancel() {
    const was = this.active || this.speaking;
    this.active = false;
    this.speaking = false;
    this.queue = [];
    if (ttsSupported()) speechSynthesis.cancel();
    if (was) this.onChange?.(false);
  }
}

/** iOS a Chrome povolia reč až po dotyku používateľa – „odomkneme“ ju prázdnou vetou. */
export function unlockSpeech() {
  if (!ttsSupported()) return;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    speechSynthesis.speak(u);
  } catch {
    // nič
  }
}
