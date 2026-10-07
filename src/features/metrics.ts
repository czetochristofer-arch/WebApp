import { addDays, endOfDay, isWithinInterval, startOfDay } from 'date-fns';
import { CLAIM_DAYS } from '@/lib/constants';
import type { Timestamp } from 'firebase/firestore';
import { toDate } from '@/lib/format';
import type { LineItem, Order, Phone, Repair } from '@/lib/types';
import { isOverdue } from '@/components/domain';

export const isRepairOpen = (r: Repair) => r.status !== 'vydane' && r.status !== 'zrusene';
export const isOrderOpen = (o: Order) => o.status !== 'vydana' && o.status !== 'zrusena';
/** Termín sa stráži len pri zariadeniach, ktoré sú v servise a ešte nie sú hotové. */
export const watchesDue = (r: Repair) => isRepairOpen(r) && r.status !== 'hotove' && r.status !== 'oznamene';
export const isRepairLate = (r: Repair) => watchesDue(r) && isOverdue(r.dueAt, true);
/** Kedy bolo zariadenie prijaté do servisu. */
export const receivedAt = (r: Repair) => r.receivedAt ?? r.createdAt;
export const isClaim = (r: Repair) => r.kind === 'reklamacia';
/** Posledný deň zákonnej lehoty na vybavenie reklamácie. */
export const claimDeadline = (r: Repair) => addDays(toDate(receivedAt(r)) ?? new Date(), CLAIM_DAYS);
/** Diel, ktorý ešte nie je objednaný (aj diel bez stavu – napr. pridaný z cenníka). */
export const partNeedsOrder = (i: LineItem) => i.kind === 'diel' && (!i.partStatus || i.partStatus === 'treba_objednat');

/** Suma zákazky – ak nemá položky, použije sa predbežná cena. */
export const repairAmount = (r: Repair) => (r.items?.length ? r.total : r.estimate ?? 0);

export function inRange(ts: Timestamp | null | undefined, from: Date, to: Date) {
  const d = toDate(ts);
  return !!d && isWithinInterval(d, { start: startOfDay(from), end: endOfDay(to) });
}

/** Tržby = vydané zákazky, objednávky a predané telefóny podľa dátumu vydania / predaja. */
export function revenue(repairs: Repair[], orders: Order[], from: Date, to: Date, phones: Phone[] = []) {
  const rs = repairs.filter((r) => r.status === 'vydane' && inRange(r.closedAt, from, to));
  const os = orders.filter((o) => o.status === 'vydana' && inRange(o.closedAt, from, to));
  const ps = phones.filter((p) => p.status === 'predane' && p.sale && inRange(p.closedAt, from, to));
  const repairRevenue = rs.reduce((s, r) => s + repairAmount(r), 0);
  const repairCost = rs.reduce((s, r) => s + (r.totalCost || 0), 0);
  const orderRevenue = os.reduce((s, o) => s + (o.total || 0), 0);
  const orderCost = os.reduce((s, o) => s + (o.totalCost || 0), 0);
  const phoneRevenue = ps.reduce((s, p) => s + (p.sale?.price || 0), 0);
  const phoneCost = ps.reduce((s, p) => s + (p.purchasePrice || 0) + (p.costs ?? []).reduce((a, c) => a + (c.amount || 0), 0), 0);
  return {
    repairs: rs,
    orders: os,
    phones: ps,
    repairRevenue,
    orderRevenue,
    phoneRevenue,
    revenue: repairRevenue + orderRevenue + phoneRevenue,
    cost: repairCost + orderCost + phoneCost,
    profit: repairRevenue + orderRevenue + phoneRevenue - repairCost - orderCost - phoneCost,
  };
}

export function attention(repairs: Repair[], orders: Order[]) {
  const open = repairs.filter(isRepairOpen);
  return {
    overdue: open.filter(isRepairLate),
    partsToOrder: open.filter((r) => r.items?.some(partNeedsOrder)),
    awaitingApproval: open.filter((r) => r.status === 'caka_schvalenie'),
    ready: open.filter((r) => r.status === 'hotove'),
    ordersToOrder: orders.filter((o) => o.status === 'nova'),
    ordersArrived: orders.filter((o) => o.status === 'dorucena'),
  };
}
