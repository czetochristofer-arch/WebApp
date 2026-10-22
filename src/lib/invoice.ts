import { addDays, endOfDay } from 'date-fns';
import { arrayUnion, doc, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { clean, history } from './db';
import { round2, toDate } from './format';
import type { BusinessSettings, Customer, InvoiceBuyer, InvoiceInfo, InvoiceLine, LineItem, PaymentMethod, Repair } from './types';

/** Číslo faktúry: [prefix]RRRRNNNN, napr. 20260001 – číselné, dá sa použiť aj ako variabilný symbol. */
export const invoiceNumber = (prefix: string, year: number, seq: number) => `${prefix}${year}${String(seq).padStart(4, '0')}`;
export const invoiceCounterId = (year: number) => `invoices-${year}`;
/** Ďalšie poradové číslo faktúry v danom roku (číslovanie začína každý rok od 1). */
export async function getInvoiceCounter(year: number) {
  const snap = await runTransaction(db, async (tx) => tx.get(doc(db, 'counters', invoiceCounterId(year))));
  return snap.exists() ? (snap.data().next as number) : 1;
}
export async function setInvoiceCounter(year: number, next: number) {
  await setDoc(doc(db, 'counters', invoiceCounterId(year)), { next }, { merge: true });
}

/** Variabilný symbol = číslice z čísla faktúry (max. 10). */
export const variableSymbol = (number: string) => number.replace(/\D/g, '').slice(-10);

/**
 * Riadky faktúry zo zákazky. Diel zapísaný len kvôli objednaniu (bez ceny) sa nefakturuje;
 * zákazka bez nacenených položiek sa fakturuje jedným riadkom za predbežnú cenu.
 */
export function invoiceLines(r: Pick<Repair, 'items' | 'estimate' | 'device' | 'problem' | 'diagnosis'>): InvoiceLine[] {
  const lines = (r.items ?? []).filter((i: LineItem) => (i.qty || 0) * (i.price || 0) !== 0).map((i) => ({ name: i.name || 'Položka', qty: i.qty || 1, price: i.price || 0 }));
  if (lines.length) return lines;
  const device = `${r.device?.brand ?? ''} ${r.device?.model ?? ''}`.trim();
  const what = (r.diagnosis || r.problem || '').split('\n')[0].trim();
  return [{ name: `Oprava zariadenia${device ? ` ${device}` : ''}${what ? ` – ${what}` : ''}`, qty: 1, price: r.estimate ?? 0 }];
}

export const linesTotal = (lines: InvoiceLine[]) => round2(lines.reduce((s, l) => s + l.qty * l.price, 0));

/** Rozpis DPH (ceny v aplikácii sú konečné, s DPH). */
export function vatBreakdown(total: number, rate: number) {
  const base = round2(total / (1 + rate / 100));
  return { base, vat: round2(total - base) };
}
export const netPrice = (price: number, rate: number) => round2(price / (1 + rate / 100));

export function buyerFrom(customer: Partial<Customer> | undefined, fallbackName: string): InvoiceBuyer {
  return clean({
    name: customer?.name || fallbackName,
    company: customer?.company || '',
    address: customer?.address || '',
    ico: customer?.ico || '',
    dic: customer?.dic || '',
    icdph: '',
  });
}

export interface InvoiceOptions {
  issuedAt?: Date;
  supplyAt?: Date;
  dueAt?: Date;
  paymentMethod?: PaymentMethod;
  buyer?: InvoiceBuyer;
  note?: string;
}

/**
 * Vystaví faktúru k zákazke. Číslo sa pridelí v transakcii spolu so zápisom do zákazky,
 * takže sa nestratí ani nezdvojí; ak už zákazka faktúru má, vráti existujúcu.
 */
export async function issueInvoice(repairId: string, settings: BusinessSettings, opts: InvoiceOptions = {}) {
  return runTransaction(db, async (tx) => {
    const repairRef = doc(db, 'repairs', repairId);
    const snap = await tx.get(repairRef);
    if (!snap.exists()) throw new Error('Zákazka sa nenašla.');
    const r = { id: snap.id, ...snap.data() } as Repair;
    if (r.invoice) return r.invoice;
    const customerSnap = !opts.buyer && r.customerId ? await tx.get(doc(db, 'customers', r.customerId)) : null;
    const issued = opts.issuedAt ?? new Date();
    const year = issued.getFullYear();
    const counterRef = doc(db, 'counters', invoiceCounterId(year));
    const counter = await tx.get(counterRef);
    const seq = counter.exists() ? (counter.data().next as number) : 1;
    const lines = invoiceLines(r);
    const paymentMethod = opts.paymentMethod ?? r.paymentMethod ?? 'hotovost';
    const due = opts.dueAt ?? (r.paid || paymentMethod !== 'prevod' ? issued : addDays(issued, settings.invoiceDueDays ?? 14));
    const invoice: InvoiceInfo = clean({
      number: invoiceNumber(settings.invoicePrefix ?? '', year, seq),
      seq,
      year,
      issuedAt: Timestamp.fromDate(issued),
      supplyAt: Timestamp.fromDate(opts.supplyAt ?? toDate(r.closedAt) ?? issued),
      dueAt: Timestamp.fromDate(endOfDay(due)),
      paymentMethod,
      buyer: opts.buyer ?? buyerFrom(customerSnap?.exists() ? (customerSnap.data() as Customer) : undefined, r.customer?.name ?? ''),
      lines,
      total: linesTotal(lines),
      deposit: r.deposit || 0,
      vatRate: settings.vatPayer ? (settings.vatRate ?? 23) : null,
      note: opts.note ?? '',
    });
    tx.set(counterRef, { next: seq + 1 }, { merge: true });
    tx.update(repairRef, { invoice, updatedAt: serverTimestamp(), history: arrayUnion(history(`Vystavená faktúra č. ${invoice.number}`)) });
    return invoice;
  });
}

/** Úprava údajov faktúry – číslo ostáva. `refreshLines` prevezme aktuálne položky zákazky. */
export async function updateInvoice(r: Repair, patch: Partial<Omit<InvoiceInfo, 'number' | 'seq' | 'year'>>, refreshLines = false) {
  if (!r.invoice) return;
  const lines = refreshLines ? invoiceLines(r) : (patch.lines ?? r.invoice.lines);
  const invoice: InvoiceInfo = clean({ ...r.invoice, ...patch, lines, total: linesTotal(lines), ...(refreshLines ? { deposit: r.deposit || 0 } : {}) });
  await updateDoc(doc(db, 'repairs', r.id), { invoice, updatedAt: serverTimestamp(), history: arrayUnion(history(`Upravená faktúra č. ${invoice.number}`)) });
}

/** Líšia sa položky faktúry od aktuálnej zákazky? (upozornenie v detaile) */
export function invoiceOutdated(r: Repair) {
  if (!r.invoice) return false;
  const now = invoiceLines(r);
  return JSON.stringify(now) !== JSON.stringify(r.invoice.lines) || (r.deposit || 0) !== (r.invoice.deposit || 0);
}
