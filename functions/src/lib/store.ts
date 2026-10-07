import { getFirestore, FieldValue, Timestamp, type DocumentData } from 'firebase-admin/firestore';
import { buildKeywords, phoneDigits } from './keywords.js';
import { localYmd } from './time.js';

export const db = () => getFirestore();
export { FieldValue, Timestamp };

export const REPAIR_STATUSES = ['oznamene', 'prijate', 'diagnostika', 'caka_schvalenie', 'caka_diely', 'v_oprave', 'hotove', 'vydane', 'zrusene'] as const;
export const OPEN_REPAIR = ['oznamene', 'prijate', 'diagnostika', 'caka_schvalenie', 'caka_diely', 'v_oprave', 'hotove'];
export const REPAIR_LABEL: Record<string, string> = {
  oznamene: 'Oznámené – čaká na prinesenie',
  prijate: 'Prijaté',
  diagnostika: 'Diagnostika',
  caka_schvalenie: 'Čaká na schválenie',
  caka_diely: 'Čaká na diely',
  v_oprave: 'V oprave',
  hotove: 'Hotové – na vyzdvihnutie',
  vydane: 'Vydané',
  zrusene: 'Zrušené',
};
export const ORDER_STATUSES = ['nova', 'objednana', 'dorucena', 'vydana', 'zrusena'] as const;
export const OPEN_ORDER = ['nova', 'objednana', 'dorucena'];
export const ORDER_LABEL: Record<string, string> = {
  nova: 'Treba objednať',
  objednana: 'Objednané',
  dorucena: 'Doručené – na vyzdvihnutie',
  vydana: 'Vydané',
  zrusena: 'Zrušené',
};

export interface LineItem {
  id: string;
  kind: 'praca' | 'diel' | 'tovar' | 'ine';
  name: string;
  qty: number;
  price: number;
  cost: number;
  partStatus?: string | null;
  supplier?: string;
}

export const DEFAULT_WARRANTY_MONTHS = 12;

/** Záruka zákazky v mesiacoch alebo dňoch (staršie zákazky s pôvodnou predvolenou zárukou 90 dní dostanú predvolenú záruku). */
export function warrantyOf(r: DocumentData, defaultMonths: number): { months: number } | { days: number } {
  if (typeof r.warrantyMonths === 'number') return { months: r.warrantyMonths };
  if (typeof r.warrantyDays === 'number' && r.warrantyDays !== 90) return { days: r.warrantyDays };
  return { months: defaultMonths };
}

export function warrantyText(w: { months: number } | { days: number }) {
  const plural = (n: number, one: string, few: string, many: string) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);
  return 'months' in w ? `${w.months} ${plural(w.months, 'mesiac', 'mesiace', 'mesiacov')}` : `${w.days} ${plural(w.days, 'deň', 'dni', 'dní')}`;
}

/** Posledný deň záruky (YYYY-MM-DD v slovenskom čase). */
export function warrantyEndYmd(w: { months: number } | { days: number }, from: Date) {
  const [y, m, d] = localYmd(from).split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  if ('days' in w) {
    const t = new Date(Date.UTC(y, m - 1, d + w.days));
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
  }
  // 31. 1. + 1 mesiac = posledný deň februára (ako date-fns addMonths v aplikácii).
  const first = new Date(Date.UTC(y, m - 1 + w.months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.getUTCFullYear()}-${pad(first.getUTCMonth() + 1)}-${pad(Math.min(d, last))}`;
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function totals(items: LineItem[]) {
  let total = 0;
  let totalCost = 0;
  for (const i of items) {
    total += (i.qty || 0) * (i.price || 0);
    totalCost += (i.qty || 0) * (i.cost || 0);
  }
  return { total: round2(total), totalCost: round2(totalCost) };
}

export const newItemId = () => Math.random().toString(36).slice(2, 10);

export async function nextNumber(kind: 'repairs' | 'orders' | 'claims', prefix: string) {
  const ref = db().doc(`counters/${kind}`);
  const seq = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const next = snap.exists ? (snap.data()!.next as number) : 1001;
    tx.set(ref, { next: next + 1 }, { merge: true });
    return next;
  });
  return { seq, number: `${prefix}-${seq}` };
}

export async function getSettings(): Promise<DocumentData> {
  const snap = await db().doc('settings/business').get();
  return {
    name: 'ChrisStop',
    repairPrefix: 'Z',
    orderPrefix: 'O',
    claimPrefix: 'R',
    phonePrefix: 'V',
    defaultWarrantyMonths: DEFAULT_WARRANTY_MONTHS,
    vatPayer: false,
    ...(snap.exists ? snap.data() : {}),
  };
}

export function repairKeywords(r: { number?: string; customer?: { name?: string; phone?: string }; device?: { brand?: string; model?: string; imei?: string } }) {
  return buildKeywords(r.number, r.number?.split('-')[1], r.customer?.name, r.customer?.phone, r.device?.brand, r.device?.model, r.device?.imei);
}

export function orderKeywords(o: { number?: string; customer?: { name?: string; phone?: string }; supplier?: string; items?: LineItem[] }) {
  return buildKeywords(o.number, o.number?.split('-')[1], o.customer?.name, o.customer?.phone, o.supplier, ...(o.items ?? []).map((i) => i.name));
}

export function customerKeywords(c: { name?: string; phone?: string; email?: string; company?: string; ico?: string }) {
  return buildKeywords(c.name, c.phone, c.email, c.company, c.ico);
}

export interface CustomerInput {
  id?: string;
  name: string;
  phone?: string;
  email?: string;
}

/** Nájde zákazníka podľa ID alebo telefónu; inak vytvorí nového. */
export async function ensureCustomer(c: CustomerInput): Promise<{ id: string | null; name: string; phone: string; email: string }> {
  const col = db().collection('customers');
  if (c.id) {
    const snap = await col.doc(c.id).get();
    if (snap.exists) {
      const d = snap.data()!;
      return { id: snap.id, name: d.name, phone: d.phone ?? '', email: d.email ?? '' };
    }
  }
  const name = c.name?.trim();
  if (!name) return { id: null, name: '', phone: '', email: '' };
  const digits = phoneDigits(c.phone);
  if (digits.length >= 6) {
    const found = await col.where('keywords', 'array-contains', digits.slice(0, 15)).limit(1).get();
    if (!found.empty) {
      const d = found.docs[0].data();
      return { id: found.docs[0].id, name: d.name, phone: d.phone ?? '', email: d.email ?? '' };
    }
  }
  const data = { name, phone: c.phone?.trim() ?? '', email: c.email?.trim() ?? '' };
  const ref = await col.add({
    ...data,
    company: '',
    ico: '',
    dic: '',
    address: '',
    note: '',
    keywords: customerKeywords(data),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { id: ref.id, ...data };
}

export const history = (by: string, text: string) => ({ at: Timestamp.now(), by, text });
