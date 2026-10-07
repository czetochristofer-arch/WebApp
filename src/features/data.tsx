import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { doc, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { subDays } from 'date-fns';
import { db } from '@/lib/firebase';
import { col } from '@/lib/db';
import { useLiveDoc, useLiveQuery } from '@/lib/hooks';
import { DEFAULT_SETTINGS, OPEN_ORDER_STATUSES, OPEN_PHONE_STATUSES, OPEN_REPAIR_STATUSES } from '@/lib/constants';
import type { BusinessSettings, CalendarEvent, Customer, Order, Phone, PriceItem, Repair } from '@/lib/types';

interface DataState {
  settings: BusinessSettings;
  repairs: Repair[];
  orders: Order[];
  customers: Customer[];
  priceList: PriceItem[];
  events: CalendarEvent[];
  /** Telefóny na sklade + nedávno predané/vyradené. */
  phones: Phone[];
  loading: boolean;
}

const DataContext = createContext<DataState | null>(null);

/** Uzavreté zákazky a objednávky sa v zozname držia takto dlho (staršie sa dohľadajú vyhľadávaním). */
export const RECENT_DAYS = 120;

function mergeById<T extends { id: string }>(...lists: T[][]) {
  const map = new Map<string, T>();
  for (const list of lists) for (const item of list) map.set(item.id, item);
  return [...map.values()];
}

const byCreatedDesc = (a: { createdAt?: Timestamp }, b: { createdAt?: Timestamp }) =>
  (b.createdAt?.toMillis?.() ?? Date.now()) - (a.createdAt?.toMillis?.() ?? Date.now());

export function DataProvider({ children }: { children: ReactNode }) {
  // Hranica "nedávnych" záznamov sa počíta raz za deň, aby sa dopyt zbytočne nemenil.
  const dayKey = new Date().toISOString().slice(0, 10);
  const since = useMemo(() => Timestamp.fromDate(subDays(new Date(), RECENT_DAYS)), [dayKey]);
  const eventsSince = useMemo(() => Timestamp.fromDate(subDays(new Date(), 60)), [dayKey]);

  const settingsDoc = useLiveDoc<BusinessSettings & { id: string }>(doc(db, 'settings', 'business'), 'settings');
  const repairsOpen = useLiveQuery<Repair>(() => query(col.repairs(), where('status', 'in', OPEN_REPAIR_STATUSES)), 'repairs-open');
  const repairsRecent = useLiveQuery<Repair>(() => query(col.repairs(), where('closedAt', '>=', since)), `repairs-recent-${dayKey}`);
  const ordersOpen = useLiveQuery<Order>(() => query(col.orders(), where('status', 'in', OPEN_ORDER_STATUSES)), 'orders-open');
  const ordersRecent = useLiveQuery<Order>(() => query(col.orders(), where('closedAt', '>=', since)), `orders-recent-${dayKey}`);
  const customers = useLiveQuery<Customer>(() => query(col.customers(), orderBy('name')), 'customers');
  const priceList = useLiveQuery<PriceItem>(() => query(col.priceList(), orderBy('name')), 'pricelist');
  const events = useLiveQuery<CalendarEvent>(() => query(col.events(), where('start', '>=', eventsSince)), `events-${dayKey}`);
  const phonesOpen = useLiveQuery<Phone>(() => query(col.phones(), where('status', 'in', OPEN_PHONE_STATUSES)), 'phones-open');
  const phonesRecent = useLiveQuery<Phone>(() => query(col.phones(), where('closedAt', '>=', since)), `phones-recent-${dayKey}`);

  const value = useMemo<DataState>(
    () => ({
      settings: { ...DEFAULT_SETTINGS, ...(settingsDoc.data ?? {}) },
      repairs: mergeById(repairsRecent.data, repairsOpen.data).sort(byCreatedDesc),
      orders: mergeById(ordersRecent.data, ordersOpen.data).sort(byCreatedDesc),
      customers: customers.data,
      priceList: priceList.data,
      events: events.data,
      phones: mergeById(phonesRecent.data, phonesOpen.data).sort(byCreatedDesc),
      loading: repairsOpen.loading || ordersOpen.loading,
    }),
    [settingsDoc.data, repairsOpen.data, repairsRecent.data, ordersOpen.data, ordersRecent.data, customers.data, priceList.data, events.data, phonesOpen.data, phonesRecent.data, repairsOpen.loading, ordersOpen.loading],
  );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData mimo DataProvider');
  return ctx;
}
