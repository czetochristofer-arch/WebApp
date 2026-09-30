import { format, formatDistanceToNowStrict, isToday, isTomorrow, isYesterday } from 'date-fns';
import { sk } from 'date-fns/locale';
import type { Timestamp } from 'firebase/firestore';

type DateLike = Date | Timestamp | null | undefined;

export function toDate(d: DateLike): Date | null {
  if (!d) return null;
  if (d instanceof Date) return d;
  if (typeof (d as Timestamp).toDate === 'function') return (d as Timestamp).toDate();
  return null;
}

const money = new Intl.NumberFormat('sk-SK', { style: 'currency', currency: 'EUR' });
export const fmtMoney = (n: number | null | undefined) => money.format(Number.isFinite(n as number) ? (n as number) : 0);
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function fmtDate(d: DateLike, pattern = 'd. M. yyyy') {
  const x = toDate(d);
  return x ? format(x, pattern, { locale: sk }) : '—';
}

export function fmtDateTime(d: DateLike) {
  return fmtDate(d, 'd. M. yyyy HH:mm');
}

export function fmtTime(d: DateLike) {
  return fmtDate(d, 'HH:mm');
}

/** Ľudsky čitateľný deň: Dnes, Zajtra, Včera, alebo "pi 3. 10." */
export function fmtDay(d: DateLike, withTime = false) {
  const x = toDate(d);
  if (!x) return '—';
  const t = withTime ? ` ${format(x, 'HH:mm')}` : '';
  if (isToday(x)) return `Dnes${t}`;
  if (isTomorrow(x)) return `Zajtra${t}`;
  if (isYesterday(x)) return `Včera${t}`;
  return format(x, 'EEEEEE d. M.', { locale: sk }) + t;
}

export function fmtAgo(d: DateLike) {
  const x = toDate(d);
  return x ? `pred ${formatDistanceToNowStrict(x, { locale: sk })}` : '—';
}

/** Odstráni diakritiku a prevedie na malé písmená. */
export function normalize(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function phoneDigits(p?: string) {
  return (p ?? '').replace(/\D/g, '');
}

/** Telefón vo formáte vhodnom pre odkazy tel:/sms:/wa.me (slovenské čísla doplní na +421). */
export function intlPhone(p?: string) {
  let d = phoneDigits(p);
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = '421' + d.slice(1);
  return d;
}

export function fmtPhone(p?: string) {
  const d = phoneDigits(p);
  if (d.length === 10 && d.startsWith('0')) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  return p ?? '';
}

export function toDateInput(d: DateLike) {
  const x = toDate(d);
  return x ? format(x, 'yyyy-MM-dd') : '';
}

export function toDateTimeInput(d: DateLike) {
  const x = toDate(d);
  return x ? format(x, "yyyy-MM-dd'T'HH:mm") : '';
}

export function parseNum(v: string | number | null | undefined): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (!v) return 0;
  const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}
