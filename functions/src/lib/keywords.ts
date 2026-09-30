// Rovnaký algoritmus ako v aplikácii (src/lib/keywords.ts) – musia zostať zhodné.
export function normalize(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export const phoneDigits = (p?: string | null) => (p ?? '').replace(/\D/g, '');

export function buildKeywords(...parts: (string | number | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const part of parts) {
    if (part === null || part === undefined || part === '') continue;
    const text = normalize(String(part));
    for (const word of text.split(/[^a-z0-9]+/)) {
      if (word.length < 2) continue;
      for (let i = 2; i <= Math.min(word.length, 15); i++) out.add(word.slice(0, i));
    }
    const digits = phoneDigits(String(part));
    if (digits.length >= 6) {
      const variants = new Set([digits]);
      if (digits.startsWith('421')) variants.add('0' + digits.slice(3));
      if (digits.startsWith('0')) variants.add('421' + digits.slice(1));
      for (const v of variants) for (let i = 3; i <= v.length; i++) out.add(v.slice(0, i));
    }
  }
  return [...out].slice(0, 400);
}

export function searchToken(q: string): string | null {
  const digits = phoneDigits(q);
  if (digits.length >= 3 && digits.length === q.replace(/[\s+/-]/g, '').length) return digits.slice(0, 15);
  const word = normalize(q).split(/[^a-z0-9]+/).find((w) => w.length >= 2);
  return word ? word.slice(0, 15) : null;
}

export function matches(haystack: (string | number | null | undefined)[], q: string): boolean {
  const words = normalize(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = normalize(haystack.filter((x) => x !== null && x !== undefined).join(' '));
  const hayDigits = phoneDigits(hay);
  // Tolerancia na slovenské koncovky: „bateria“ nájde aj „baterie“, „displeja“ aj „displej“.
  const stem = (w: string) => (w.length >= 5 ? w.slice(0, w.length - 2) : w);
  return words.every((w) => hay.includes(w) || hay.includes(stem(w)) || (/^\d{3,}$/.test(w) && hayDigits.includes(w)));
}
