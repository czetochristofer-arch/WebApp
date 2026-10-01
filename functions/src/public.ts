import type { DocumentData } from 'firebase-admin/firestore';
import { DEFAULT_WARRANTY_MONTHS, REPAIR_LABEL, Timestamp, db, getSettings, round2, warrantyEndYmd, warrantyOf, warrantyText } from './lib/store.js';

const iso = (t: unknown) => (t instanceof Timestamp ? t.toDate().toISOString() : null);

/** "Ján Novák" → "Ján N." – na verejnej stránke nezobrazujeme celé meno. */
function shortName(name?: string) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

/**
 * Údaje pre verejnú stránku stavu opravy (QR kód na protokole, odkaz v SMS).
 * ID zákazky je náhodné a nedá sa uhádnuť; vraciame len to, čo potrebuje vidieť zákazník –
 * bez telefónu, IMEI, kódu na odomknutie, interných poznámok či nákupných cien.
 */
export async function publicRepairStatus(id: string) {
  const snap = await db().doc(`repairs/${id}`).get();
  if (!snap.exists) return null;
  const r = snap.data() as DocumentData;
  const settings = await getSettings();
  const amount = round2(r.items?.length ? r.total ?? 0 : r.estimate ?? 0);
  const deposit = round2(r.deposit ?? 0);
  const closed = r.closedAt instanceof Timestamp ? r.closedAt.toDate() : null;
  const w = warrantyOf(r, Number(settings.defaultWarrantyMonths) || DEFAULT_WARRANTY_MONTHS);
  return {
    number: r.number as string,
    status: r.status as string,
    statusLabel: REPAIR_LABEL[r.status] ?? r.status,
    device: `${r.device?.brand ?? ''} ${r.device?.model ?? ''}`.trim(),
    deviceType: r.device?.type ?? null,
    problem: r.problem ?? '',
    customer: shortName(r.customer?.name),
    createdAt: iso(r.createdAt),
    receivedAt: r.status === 'oznamene' ? null : iso(r.receivedAt ?? r.createdAt),
    dueAt: iso(r.dueAt),
    closedAt: iso(r.closedAt),
    updatedAt: iso(r.updatedAt),
    amount,
    deposit,
    toPay: r.paid ? 0 : Math.max(0, round2(amount - deposit)),
    paid: !!r.paid,
    items: r.status === 'caka_schvalenie' || r.status === 'hotove' || r.status === 'vydane'
      ? (r.items ?? []).map((i: DocumentData) => ({ name: i.name, qty: i.qty, price: i.price }))
      : [],
    warranty: warrantyText(w),
    warrantyUntil: r.status === 'vydane' && closed ? warrantyEndYmd(w, closed) : null,
    business: {
      name: settings.name ?? 'ChrisStop',
      phone: settings.phone || null,
      email: settings.email || null,
      address: settings.address || null,
      web: settings.web || null,
    },
  };
}
