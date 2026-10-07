import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes, deleteObject } from 'firebase/storage';
import { auth, db, storage } from './firebase';
import { buildKeywords } from './keywords';
import { phoneDigits, round2 } from './format';
import type {
  BusinessSettings,
  CalendarEvent,
  Customer,
  CustomerRef,
  LineItem,
  Order,
  OrderStatus,
  PartStatus,
  Photo,
  PriceItem,
  Repair,
  RepairStatus,
} from './types';
import { PART_STATUSES, orderStatus, repairStatus } from './constants';

export const col = {
  repairs: () => collection(db, 'repairs'),
  orders: () => collection(db, 'orders'),
  customers: () => collection(db, 'customers'),
  events: () => collection(db, 'events'),
  priceList: () => collection(db, 'priceList'),
  members: () => collection(db, 'members'),
  invites: () => collection(db, 'invites'),
};

export function actorName() {
  const u = auth.currentUser;
  return u?.displayName || u?.email || 'Používateľ';
}

function history(text: string) {
  return { at: Timestamp.now(), by: actorName(), text };
}

/** Odstráni polia s hodnotou undefined z bežných objektov (Timestamp a pod. nechá tak). */
function clean<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clean) as T;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = clean(v);
    return out as T;
  }
  return value;
}

export function newId() {
  return crypto.randomUUID().slice(0, 8);
}

export function totals(items: LineItem[]) {
  let total = 0;
  let totalCost = 0;
  for (const i of items) {
    total += (i.qty || 0) * (i.price || 0);
    totalCost += (i.qty || 0) * (i.cost || 0);
  }
  return { total: round2(total), totalCost: round2(totalCost) };
}

/** Pridelí ďalšie poradové číslo (transakcia – bez duplicít ani pri súbežnom zápise). */
export type CounterKind = 'repairs' | 'orders' | 'claims';

async function nextNumber(kind: CounterKind, prefix: string) {
  const counterRef = doc(db, 'counters', kind);
  const seq = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const next = snap.exists() ? (snap.data().next as number) : 1001;
    tx.set(counterRef, { next: next + 1 }, { merge: true });
    return next;
  });
  return { seq, number: `${prefix}-${seq}` };
}

export async function getCounter(kind: CounterKind) {
  const snap = await runTransaction(db, async (tx) => tx.get(doc(db, 'counters', kind)));
  return snap.exists() ? (snap.data().next as number) : 1001;
}

export async function setCounter(kind: CounterKind, next: number) {
  await setDoc(doc(db, 'counters', kind), { next }, { merge: true });
}

// ---------------------------------------------------------------- zákazníci

export function customerKeywords(c: Partial<Customer>) {
  return buildKeywords(c.name, c.phone, c.email, c.company, c.ico);
}

export async function saveCustomer(data: Partial<Customer> & { name: string }, id?: string) {
  const payload = clean({
    name: data.name.trim(),
    phone: data.phone?.trim() ?? '',
    email: data.email?.trim() ?? '',
    company: data.company?.trim() ?? '',
    ico: data.ico?.trim() ?? '',
    dic: data.dic?.trim() ?? '',
    address: data.address?.trim() ?? '',
    note: data.note ?? '',
    keywords: customerKeywords(data),
  });
  if (id) {
    await updateDoc(doc(db, 'customers', id), { ...payload, updatedAt: serverTimestamp() });
    return id;
  }
  const ref = await addDoc(col.customers(), { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return ref.id;
}

export async function deleteCustomer(id: string) {
  await deleteDoc(doc(db, 'customers', id));
}

/** Ak zákazka/objednávka nemá priradeného zákazníka, nájde ho podľa telefónu alebo vytvorí nového. */
async function ensureCustomer(ref: CustomerRef): Promise<string | null> {
  if (ref.id) return ref.id;
  if (!ref.name?.trim()) return null;
  const digits = phoneDigits(ref.phone);
  if (digits.length >= 6) {
    const found = await getDocs(query(col.customers(), where('keywords', 'array-contains', digits.slice(0, 15)), limit(1)));
    if (!found.empty) return found.docs[0].id;
  }
  return saveCustomer({ name: ref.name, phone: ref.phone, email: ref.email });
}

// ---------------------------------------------------------------- zákazky

export function repairKeywords(r: Pick<Repair, 'number' | 'customer' | 'device'> & { problem?: string }) {
  return buildKeywords(
    r.number,
    r.number?.split('-')[1],
    r.customer?.name,
    r.customer?.phone,
    r.device?.brand,
    r.device?.model,
    r.device?.imei,
  );
}

export type RepairInput = Omit<
  Repair,
  'id' | 'number' | 'seq' | 'keywords' | 'total' | 'totalCost' | 'createdAt' | 'updatedAt' | 'history' | 'closedAt' | 'receivedAt'
>;

/** Vopred vygenerované ID (napr. aby sa fotky mohli nahrať ešte pred uložením zákazky). */
export function newRepairId() {
  return doc(col.repairs()).id;
}

export async function createRepair(input: RepairInput, prefix: string, id = newRepairId()) {
  const claim = input.kind === 'reklamacia';
  const customerId = await ensureCustomer(input.customer);
  // Reklamácie majú vlastné číslovanie (R-1001…), aby nenarušili rad zákaziek.
  const { seq, number } = await nextNumber(claim ? 'claims' : 'repairs', prefix);
  const data = clean({
    ...input,
    customerId,
    customer: { ...input.customer, id: customerId },
    number,
    seq,
    ...totals(input.items),
    keywords: repairKeywords({ ...input, number }),
    history: [history(claim ? `Reklamácia prijatá${input.claim?.originalNumber ? ` (k ${input.claim.originalNumber})` : ''}` : `Zákazka vytvorená (${repairStatus(input.status).label})`)],
    createdBy: actorName(),
  });
  await setDoc(doc(col.repairs(), id), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), closedAt: null });
  return { id, number };
}

export async function updateRepair(prev: Repair, patch: Partial<RepairInput>, note?: string) {
  const merged = { ...prev, ...patch } as Repair;
  const update: DocumentData = { ...clean(patch), updatedAt: serverTimestamp() };
  if (patch.customer && !patch.customer.id) {
    const customerId = await ensureCustomer(patch.customer);
    update.customerId = customerId;
    update.customer = { ...clean(patch.customer), id: customerId };
  }
  if (patch.items) Object.assign(update, totals(patch.items));
  if (patch.customer || patch.device) update.keywords = repairKeywords(merged);
  const notes: string[] = [];
  if (patch.status && patch.status !== prev.status) {
    notes.push(`Stav: ${repairStatus(prev.status).label} → ${repairStatus(patch.status).label}`);
    const closed = patch.status === 'vydane' || patch.status === 'zrusene';
    update.closedAt = closed ? serverTimestamp() : null;
    // Zákazník priniesol ohlásené zariadenie – od tejto chvíle je v servise.
    if (prev.status === 'oznamene' && patch.status !== 'zrusene' && !prev.receivedAt) update.receivedAt = serverTimestamp();
  }
  if (patch.paid === true && !prev.paid) {
    notes.push('Zaplatené');
    update.paidAt = serverTimestamp();
  }
  if (note) notes.push(note);
  if (notes.length) update.history = arrayUnion(...notes.map(history));
  await updateDoc(doc(db, 'repairs', prev.id), update);
}

/**
 * Zmena stavu dielov v zákazke. Beží v transakcii nad aktuálnym stavom zákazky,
 * takže neprepíše iné súčasné zmeny (ceny, položky, poznámky).
 */
export async function setPartStatus(repairId: string, itemIds: string[], status: PartStatus, supplier?: string) {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'repairs', repairId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Zákazka sa nenašla.');
    const items = (snap.data().items ?? []) as LineItem[];
    const names: string[] = [];
    const next = items.map((i) => {
      if (!itemIds.includes(i.id)) return i;
      names.push(i.name);
      return { ...i, partStatus: status, ...(supplier?.trim() ? { supplier: supplier.trim() } : {}) };
    });
    if (!names.length) return;
    const label = PART_STATUSES.find((p) => p.id === status)?.label ?? status;
    tx.update(ref, { items: clean(next), updatedAt: serverTimestamp(), history: arrayUnion(history(`Diely – ${label.toLowerCase()}: ${names.join(', ')}`)) });
  });
}

export async function setRepairStatus(prev: Repair, status: RepairStatus) {
  await updateRepair(prev, { status });
}

export async function addRepairNote(id: string, text: string) {
  await updateDoc(doc(db, 'repairs', id), { history: arrayUnion(history(text)), updatedAt: serverTimestamp() });
}

export async function deleteRepair(r: Repair) {
  await Promise.allSettled(r.photos.map((p) => deleteObject(ref(storage, p.path))));
  await deleteDoc(doc(db, 'repairs', r.id));
}

// ---------------------------------------------------------------- objednávky

export function orderKeywords(o: Pick<Order, 'number' | 'customer' | 'items'> & { supplier?: string }) {
  return buildKeywords(o.number, o.number?.split('-')[1], o.customer?.name, o.customer?.phone, o.supplier, ...o.items.map((i) => i.name));
}

export type OrderInput = Omit<
  Order,
  'id' | 'number' | 'seq' | 'keywords' | 'total' | 'totalCost' | 'createdAt' | 'updatedAt' | 'history' | 'closedAt'
>;

export async function createOrder(input: OrderInput, prefix: string) {
  const customerId = await ensureCustomer(input.customer);
  const { seq, number } = await nextNumber('orders', prefix);
  const data = clean({
    ...input,
    customerId,
    customer: { ...input.customer, id: customerId },
    number,
    seq,
    ...totals(input.items),
    keywords: orderKeywords({ ...input, number }),
    history: [history('Objednávka vytvorená')],
    createdBy: actorName(),
  });
  const ref = await addDoc(col.orders(), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), closedAt: null });
  return { id: ref.id, number };
}

export async function updateOrder(prev: Order, patch: Partial<OrderInput>, note?: string) {
  const merged = { ...prev, ...patch } as Order;
  const update: DocumentData = { ...clean(patch), updatedAt: serverTimestamp() };
  if (patch.customer && !patch.customer.id) {
    const customerId = await ensureCustomer(patch.customer);
    update.customerId = customerId;
    update.customer = { ...clean(patch.customer), id: customerId };
  }
  if (patch.items) Object.assign(update, totals(patch.items));
  if (patch.customer || patch.items || patch.supplier !== undefined) update.keywords = orderKeywords(merged);
  const notes: string[] = [];
  if (patch.status && patch.status !== prev.status) {
    notes.push(`Stav: ${orderStatus(prev.status).label} → ${orderStatus(patch.status).label}`);
    if (patch.status === 'objednana' && !prev.orderedAt) update.orderedAt = serverTimestamp();
    if (patch.status === 'dorucena' && !prev.deliveredAt) update.deliveredAt = serverTimestamp();
    update.closedAt = patch.status === 'vydana' || patch.status === 'zrusena' ? serverTimestamp() : null;
  }
  if (patch.paid === true && !prev.paid) {
    notes.push('Zaplatené');
    update.paidAt = serverTimestamp();
  }
  if (note) notes.push(note);
  if (notes.length) update.history = arrayUnion(...notes.map(history));
  await updateDoc(doc(db, 'orders', prev.id), update);
}

export async function setOrderStatus(prev: Order, status: OrderStatus) {
  await updateOrder(prev, { status });
}

export async function deleteOrder(id: string) {
  await deleteDoc(doc(db, 'orders', id));
}

// ---------------------------------------------------------------- kalendár

export type EventInput = Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>;

export async function saveEvent(input: EventInput, id?: string) {
  const payload = { ...clean(input), updatedAt: serverTimestamp() };
  if (id) {
    await updateDoc(doc(db, 'events', id), payload);
    return id;
  }
  const ref = await addDoc(col.events(), { ...payload, createdAt: serverTimestamp() });
  return ref.id;
}

/** Presun / zmena dĺžky udalosti (ťahaním v kalendári). */
export async function moveEvent(id: string, start: Date, end: Date) {
  await updateDoc(doc(db, 'events', id), { start: Timestamp.fromDate(start), end: Timestamp.fromDate(end), updatedAt: serverTimestamp() });
}

export async function toggleEventDone(e: CalendarEvent) {
  await updateDoc(doc(db, 'events', e.id), { done: !e.done, updatedAt: serverTimestamp() });
}

export async function deleteEvent(id: string) {
  await deleteDoc(doc(db, 'events', id));
}

// ---------------------------------------------------------------- cenník

export async function savePriceItem(input: Omit<PriceItem, 'id' | 'keywords' | 'updatedAt'>, id?: string) {
  const payload = { ...clean(input), keywords: buildKeywords(input.name, input.category), updatedAt: serverTimestamp() };
  if (id) {
    await updateDoc(doc(db, 'priceList', id), payload);
    return id;
  }
  return (await addDoc(col.priceList(), payload)).id;
}

export async function deletePriceItem(id: string) {
  await deleteDoc(doc(db, 'priceList', id));
}

// ---------------------------------------------------------------- nastavenia a tím

export async function saveSettings(s: Partial<BusinessSettings>) {
  await setDoc(doc(db, 'settings', 'business'), { ...clean(s), updatedAt: serverTimestamp() }, { merge: true });
}

export async function inviteMember(email: string, role: 'owner' | 'staff') {
  const key = email.trim().toLowerCase();
  await setDoc(doc(db, 'invites', key), { email: key, role, invitedBy: actorName(), createdAt: serverTimestamp() });
}

export async function removeInvite(email: string) {
  await deleteDoc(doc(db, 'invites', email));
}

export async function removeMember(uid: string) {
  await deleteDoc(doc(db, 'members', uid));
}

// ---------------------------------------------------------------- fotky

/** Zmenší fotku na max. 1600 px a uloží ako JPEG (šetrí dáta aj úložisko). */
async function compressImage(file: File, maxSize = 1600, quality = 0.82): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality));
    return blob ?? file;
  } catch {
    return file;
  }
}

export async function uploadPhoto(folder: string, file: File): Promise<Photo> {
  const blob = await compressImage(file);
  const path = `${folder}/${Date.now()}-${newId()}.jpg`;
  const r = ref(storage, path);
  await uploadBytes(r, blob, { contentType: 'image/jpeg' });
  return { path, url: await getDownloadURL(r), name: file.name };
}

export async function deletePhoto(path: string) {
  await deleteObject(ref(storage, path)).catch(() => undefined);
}
