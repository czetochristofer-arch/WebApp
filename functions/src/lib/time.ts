export const TZ = 'Europe/Bratislava';

function tzOffsetMinutes(date: Date, tz = TZ) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return (asUtc - date.getTime()) / 60000;
}

/** "2026-10-03" + "14:30" v slovenskom čase → Date (UTC). */
export function localToDate(ymd: string, hm = '00:00', seconds = 0): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  const [h, mi] = hm.split(':').map(Number);
  const guess = Date.UTC(y, (m || 1) - 1, d || 1, h || 0, mi || 0, seconds);
  const off = tzOffsetMinutes(new Date(guess));
  const first = new Date(guess - off * 60000);
  // Korekcia pri prechode letného/zimného času.
  const off2 = tzOffsetMinutes(first);
  return off2 === off ? first : new Date(guess - off2 * 60000);
}

export const endOfLocalDay = (ymd: string) => localToDate(ymd, '23:59', 59);
export const startOfLocalDay = (ymd: string) => localToDate(ymd, '00:00');

export function localYmd(date: Date) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function localHm(date: Date) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(date);
}

export function fmtLocal(date: Date | null | undefined, withTime = false) {
  if (!date) return null;
  return new Intl.DateTimeFormat('sk-SK', {
    timeZone: TZ,
    weekday: withTime ? 'short' : undefined,
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}

export function nowDescription(now = new Date()) {
  return new Intl.DateTimeFormat('sk-SK', {
    timeZone: TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(now);
}
