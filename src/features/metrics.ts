import { endOfDay, isWithinInterval, startOfDay } from 'date-fns';
import type { Timestamp } from 'firebase/firestore';
import { toDate } from '@/lib/format';
import type { Order, Repair } from '@/lib/types';
import { isOverdue } from '@/components/domain';

export const isRepairOpen = (r: Repair) => r.status !== 'vydane' && r.status !== 'zrusene';
export const isOrderOpen = (o: Order) => o.status !== 'vydana' && o.status !== 'zrusena';

/** Suma zákazky – ak nemá položky, použije sa predbežná cena. */
export const repairAmount = (r: Repair) => (r.items?.length ? r.total : r.estimate ?? 0);

export function inRange(ts: Timestamp | null | undefined, from: Date, to: Date) {
  const d = toDate(ts);
  return !!d && isWithinInterval(d, { start: startOfDay(from), end: endOfDay(to) });
}

/** Tržby = vydané zákazky a objednávky podľa dátumu vydania. */
export function revenue(repairs: Repair[], orders: Order[], from: Date, to: Date) {
  const rs = repairs.filter((r) => r.status === 'vydane' && inRange(r.closedAt, from, to));
  const os = orders.filter((o) => o.status === 'vydana' && inRange(o.closedAt, from, to));
  const repairRevenue = rs.reduce((s, r) => s + repairAmount(r), 0);
  const repairCost = rs.reduce((s, r) => s + (r.totalCost || 0), 0);
  const orderRevenue = os.reduce((s, o) => s + (o.total || 0), 0);
  const orderCost = os.reduce((s, o) => s + (o.totalCost || 0), 0);
  return {
    repairs: rs,
    orders: os,
    repairRevenue,
    orderRevenue,
    revenue: repairRevenue + orderRevenue,
    cost: repairCost + orderCost,
    profit: repairRevenue + orderRevenue - repairCost - orderCost,
  };
}

export function attention(repairs: Repair[], orders: Order[]) {
  const open = repairs.filter(isRepairOpen);
  return {
    overdue: open.filter((r) => r.status !== 'hotove' && isOverdue(r.dueAt, true)),
    partsToOrder: open.filter((r) => r.items?.some((i) => i.kind === 'diel' && i.partStatus === 'treba_objednat')),
    awaitingApproval: open.filter((r) => r.status === 'caka_schvalenie'),
    ready: open.filter((r) => r.status === 'hotove'),
    ordersToOrder: orders.filter((o) => o.status === 'nova'),
    ordersArrived: orders.filter((o) => o.status === 'dorucena'),
  };
}
