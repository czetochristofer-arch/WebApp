import { addMonths, differenceInCalendarDays } from 'date-fns';
import { deleteObject, ref } from 'firebase/storage';
import { arrayUnion, deleteDoc, doc, getDocs, limit, query, runTransaction, serverTimestamp, setDoc, updateDoc, where, type DocumentData } from 'firebase/firestore';
import { db, storage } from './firebase';
import { actorName, clean, col, history, nextNumber } from './db';
import { buildKeywords } from './keywords';
import { round2, toDate } from './format';
import { phoneGrade, phoneStatus } from './constants';
import type { Phone, PhoneSale, PhoneStatus } from './types';

export type PhoneInput = Omit<Phone, 'id' | 'number' | 'seq' | 'keywords' | 'history' | 'createdAt' | 'updatedAt' | 'closedAt' | 'createdBy'>;

export const phoneName = (p: Pick<Phone, 'device'>) => [p.device.brand, p.device.model, p.device.storage].filter(Boolean).join(' ').trim();
export const isPhoneOpen = (p: Phone) => p.status !== 'predane' && p.status !== 'vyradene';
export const repairCosts = (p: Phone) => round2((p.costs ?? []).reduce((s, c) => s + (c.amount || 0), 0));
/** Všetky náklady na telefón: výkupná cena + repas. */
export const totalCost = (p: Phone) => round2((p.purchasePrice || 0) + repairCosts(p));
/** Očakávaný (pri predanom skutočný) zisk. */
export function phoneProfit(p: Phone) {
  const price = p.sale?.price ?? p.targetPrice;
  return price == null ? null : round2(price - totalCost(p));
}
export const daysInStock = (p: Phone) => differenceInCalendarDays(toDate(p.closedAt) ?? new Date(), toDate(p.purchasedAt) ?? toDate(p.createdAt) ?? new Date());
export const saleWarrantyUntil = (p: Phone) => (p.sale ? addMonths(p.sale.at.toDate(), p.sale.warrantyMonths) : null);

/** Kontrola IMEI (15 číslic + kontrolná číslica podľa Luhna). */
export function isValidImei(value?: string) {
  const d = (value ?? '').replace(/\D/g, '');
  if (d.length !== 15) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let x = Number(d[i]);
    if (i % 2 === 1) {
      x *= 2;
      if (x > 9) x -= 9;
    }
    sum += x;
  }
  return sum % 10 === 0;
}

export function phoneKeywords(p: Pick<Phone, 'number' | 'device' | 'seller'> & { sale?: PhoneSale | null }) {
  return buildKeywords(p.number, p.number?.split('-')[1], p.device.brand, p.device.model, p.device.imei, p.device.imei2, p.device.serial, p.seller?.name, p.seller?.phone, p.sale?.buyer?.name, p.sale?.buyer?.phone);
}

/** Je toto IMEI / SN už v evidencii telefónov? (ochrana pred dvojitým výkupom a odcudzenými kusmi) */
export async function findPhonesByIdentifier(identifier: string) {
  const norm = (v?: string) => (v ?? '').replace(/[^0-9a-z]/gi, '').toLowerCase();
  const token = norm(identifier);
  if (token.length < 6) return [];
  const snap = await getDocs(query(col.phones(), where('keywords', 'array-contains', token.slice(0, 15)), limit(20)));
  // Prefix IMEI zdieľajú telefóny rovnakého modelu – zhodu berieme len pri celom čísle.
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Phone)
    .filter((p) => [p.device.imei, p.device.imei2, p.device.serial].some((x) => norm(x) === token))
    .slice(0, 5);
}

export const isStockPhone = (p: Pick<Phone, 'origin'>) => p.origin === 'sklad';

export async function createPhone(input: PhoneInput, prefix: string, id: string) {
  // Vlastné zariadenia majú samostatný rad, aby čísla výkupných dokladov (V-…) išli bez medzier.
  const stock = input.origin === 'sklad';
  const { seq, number } = await nextNumber(stock ? 'phoneStock' : 'phones', prefix);
  const data = clean({
    ...input,
    number,
    seq,
    keywords: phoneKeywords({ ...input, number }),
    history: [
      history(
        stock
          ? `Pridané na sklad bez výkupu${input.purchasePrice ? ` (nákupná cena ${input.purchasePrice} €)` : ''}`
          : `Výkup za ${input.purchasePrice} € (${phoneGrade(input.grade).label})`,
      ),
    ],
    createdBy: actorName(),
  });
  await setDoc(doc(col.phones(), id), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), closedAt: null });
  return { id, number };
}

export async function updatePhone(prev: Phone, patch: Partial<PhoneInput>, note?: string) {
  const merged = { ...prev, ...patch } as Phone;
  const update: DocumentData = { ...clean(patch), updatedAt: serverTimestamp() };
  if (patch.device || patch.seller || patch.sale !== undefined) update.keywords = phoneKeywords(merged);
  const notes: string[] = [];
  if (patch.status && patch.status !== prev.status) {
    notes.push(`Stav: ${phoneStatus(prev.status).label} → ${phoneStatus(patch.status).label}`);
    update.closedAt = patch.status === 'predane' || patch.status === 'vyradene' ? (prev.closedAt ?? serverTimestamp()) : null;
  }
  if (note) notes.push(note);
  if (notes.length) update.history = arrayUnion(...notes.map(history));
  await updateDoc(doc(db, 'phones', prev.id), update);
}

/** Úprava zoznamov (úlohy, náklady) nad aktuálnym stavom dokumentu – súbežné zmeny sa neprepíšu. */
export async function mutatePhone(id: string, fn: (p: Phone) => { patch: Partial<PhoneInput>; note?: string }) {
  await runTransaction(db, async (tx) => {
    const r = doc(db, 'phones', id);
    const snap = await tx.get(r);
    if (!snap.exists()) throw new Error('Telefón sa nenašiel.');
    const current = { id: snap.id, ...snap.data() } as Phone;
    const { patch, note } = fn(current);
    const update: DocumentData = { ...clean(patch), updatedAt: serverTimestamp() };
    if (note) update.history = arrayUnion(history(note));
    tx.update(r, update);
  });
}

export async function setPhoneStatus(prev: Phone, status: PhoneStatus, extra?: Partial<PhoneInput>) {
  await updatePhone(prev, { status, ...extra });
}

export async function sellPhone(prev: Phone, sale: PhoneSale) {
  const patch: Partial<PhoneInput> = { status: 'predane', sale, reservedFor: '' };
  await updatePhone(prev, patch, `Predané za ${sale.price} € – ${sale.buyer.name || 'zákazník'}`);
}

export async function cancelSale(prev: Phone) {
  await updatePhone(prev, { status: 'vystavene', sale: null }, 'Predaj zrušený');
}

export async function deletePhone(p: Phone) {
  await Promise.allSettled(p.photos.map((x) => deleteObject(ref(storage, x.path))));
  await deleteDoc(doc(db, 'phones', p.id));
}

/** Text inzerátu (Bazoš, Marketplace…) – stačí skopírovať. */
export function adText(p: Phone, business: { name: string; address?: string; phone?: string }, warrantyMonths: number) {
  const g = phoneGrade(p.grade);
  const lines = [
    `Predám ${phoneName(p)}${p.device.color ? `, ${p.device.color}` : ''}`,
    '',
    `Stav: ${g.label} (${g.text.toLowerCase()})`,
    p.device.batteryHealth ? `Kondícia batérie: ${p.device.batteryHealth} %` : '',
    p.tasks?.some((t) => t.done && /bat/i.test(t.name)) ? 'Nová batéria' : '',
    p.device.accessories ? `Príslušenstvo: ${p.device.accessories}` : '',
    'Telefón je skontrolovaný v servise, odblokovaný pre všetky siete, bez viazanosti na účet.',
    `Záruka ${warrantyMonths} mesiacov, doklad o kúpe.`,
    '',
    p.targetPrice ? `Cena: ${p.targetPrice} €` : '',
    `${business.name}${business.address ? `, ${business.address}` : ''}${business.phone ? `, tel. ${business.phone}` : ''}`,
  ];
  return lines.filter((l, i, a) => l !== '' || (a[i - 1] !== '' && i > 0)).join('\n').trim();
}
