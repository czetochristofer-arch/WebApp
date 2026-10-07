import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { doc, Timestamp } from 'firebase/firestore';
import { endOfDay } from 'date-fns';
import { Package, PackageCheck, Plus, Search, ShieldAlert, Trash2, Truck, Wrench } from 'lucide-react';
import { PartsBoard } from '@/features/PartsBoard';
import { db } from '@/lib/firebase';
import { useLiveDoc } from '@/lib/hooks';
import { useAuth } from '@/features/auth';
import { useData } from '@/features/data';
import { isOrderOpen, isRepairOpen, partNeedsOrder } from '@/features/metrics';
import { Badge, Button, EmptyState, Input, Modal, PageHeader, Segmented, Textarea, cx } from '@/components/ui';
import { ContactButtons, CustomerPicker, ItemsEditor, OrderStatusBadge, fillTemplate } from '@/components/domain';
import { useFeedback } from '@/components/feedback';
import { ORDER_STATUSES, PAYMENT_METHODS } from '@/lib/constants';
import { createOrder, deleteOrder, setOrderStatus, updateOrder, type OrderInput } from '@/lib/db';
import { fmtDate, fmtDay, fmtMoney, fmtPhone, parseNum, toDateInput } from '@/lib/format';
import { matches } from '@/lib/keywords';
import type { Order, OrderStatus, PaymentMethod } from '@/lib/types';

type Filter = 'aktivne' | OrderStatus | 'vsetky';

type Tab = 'diely' | 'tovar';

export function OrdersPage() {
  const { orders, repairs } = useData();
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('aktivne');
  const [q, setQ] = useState('');
  const creating = params.get('nova') === '1';
  const [tabPref, setTabPref] = useState<Tab>(() => {
    try {
      return (localStorage.getItem('cs-orders-tab') as Tab) || 'diely';
    } catch {
      return 'diely';
    }
  });
  const tab: Tab = (params.get('typ') as Tab) || (creating || id ? 'tovar' : tabPref);
  const setTab = (t: Tab) => {
    setTabPref(t);
    try {
      localStorage.setItem('cs-orders-tab', t);
    } catch {
      // nič
    }
    if (params.get('typ')) setParams({}, { replace: true });
  };
  const partsToOrder = useMemo(() => repairs.filter(isRepairOpen).reduce((n, r) => n + (r.items ?? []).filter(partNeedsOrder).length, 0), [repairs]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { aktivne: 0 };
    for (const o of orders) {
      c[o.status] = (c[o.status] ?? 0) + 1;
      if (isOrderOpen(o)) c.aktivne++;
    }
    return c;
  }, [orders]);

  const list = useMemo(
    () =>
      orders
        .filter((o) => (q.trim() ? matches([o.number, o.customer?.name, o.customer?.phone, o.supplier, ...o.items.map((i) => i.name)], q) : true))
        .filter((o) => q.trim() || (filter === 'aktivne' ? isOrderOpen(o) : filter === 'vsetky' ? true : o.status === filter))
        .sort((a, b) => b.seq - a.seq),
    [orders, filter, q],
  );

  const close = () => {
    if (creating) setParams({}, { replace: true });
    else navigate('/objednavky', { replace: true });
  };

  return (
    <div>
      <PageHeader
        title="Objednávky"
        subtitle={tab === 'diely' ? 'Náhradné diely do rozpracovaných zákaziek' : 'Tovar a príslušenstvo pre zákazníkov – kryty, sklá, nabíjačky…'}
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setParams({ nova: '1' })}>
            Nová objednávka
          </Button>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-2 sm:max-w-xl">
        {(
          [
            {
              id: 'diely',
              icon: <Wrench className="size-5" />,
              title: 'Objednávky dielov',
              sub: partsToOrder ? `${partsToOrder} treba objednať` : 'všetko objednané',
              alert: partsToOrder > 0,
            },
            { id: 'tovar', icon: <Package className="size-5" />, title: 'Objednávky iné', sub: `${counts.aktivne} aktívnych · kryty, sklá…`, alert: false },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cx(
              'flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors',
              tab === t.id ? 'border-primary bg-primary-soft' : 'border-line bg-surface hover:border-primary/40',
            )}
          >
            <span
              className={cx(
                'flex size-10 shrink-0 items-center justify-center rounded-xl',
                tab === t.id ? 'bg-primary text-primary-fg' : 'bg-surface-2 text-muted',
              )}
            >
              {t.icon}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{t.title}</span>
              <span className={cx('block truncate text-xs', t.alert ? 'font-semibold text-red-600 dark:text-red-400' : 'text-muted')}>{t.sub}</span>
            </span>
          </button>
        ))}
      </div>
      {tab === 'diely' ? (
        <PartsBoard />
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hľadať podľa položky, zákazníka, dodávateľa…" className="pl-9" />
            </div>
            {!q && (
              <Segmented
                value={filter}
                onChange={setFilter}
                options={[
                  { id: 'aktivne', label: 'Aktívne', count: counts.aktivne },
                  ...ORDER_STATUSES.filter((s) => s.open).map((s) => ({ id: s.id as Filter, label: s.label.split(' –')[0], count: counts[s.id] ?? 0 })),
                  { id: 'vydana', label: 'Vydané' },
                  { id: 'vsetky', label: 'Všetky' },
                ]}
              />
            )}
          </div>

          {list.length === 0 ? (
            <div className="rounded-2xl border border-line bg-surface">
              <EmptyState
                icon={<Package />}
                title="Žiadne objednávky"
                text="Puzdrá, ochranné sklá, nabíjačky a iný tovar na objednávku."
                action={
                  <Button variant="primary" onClick={() => setParams({ nova: '1' })}>
                    Nová objednávka
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {list.map((o) => (
                <OrderCard key={o.id} o={o} onOpen={() => navigate(`/objednavky/${o.id}`)} />
              ))}
            </div>
          )}
        </>
      )}

      {(creating || id) && <OrderDialog id={creating ? null : id!} onClose={close} />}
    </div>
  );
}

function OrderCard({ o, onOpen }: { o: Order; onOpen: () => void }) {
  const { run } = useFeedback();
  const next: Partial<Record<OrderStatus, { status: OrderStatus; label: string; icon: React.ReactNode }>> = {
    nova: { status: 'objednana', label: 'Objednané', icon: <Truck className="size-4" /> },
    objednana: { status: 'dorucena', label: 'Doručené', icon: <PackageCheck className="size-4" /> },
  };
  const step = next[o.status];
  return (
    <div className="flex flex-col rounded-2xl border border-line bg-surface p-4">
      <button onClick={onOpen} className="flex-1 text-left">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="font-semibold text-primary tabular">{o.number}</span>
          <OrderStatusBadge status={o.status} />
        </div>
        <p className="font-semibold">{o.items.map((i) => (i.qty > 1 ? `${i.qty}× ${i.name}` : i.name)).join(', ') || 'Bez položiek'}</p>
        <p className="mt-0.5 text-sm text-muted">
          {o.customer.name}
          {o.customer.phone ? ` · ${fmtPhone(o.customer.phone)}` : ''}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {o.supplier && <span>Dodávateľ: {o.supplier}</span>}
          {o.expectedAt && <span>Očakávané: {fmtDay(o.expectedAt)}</span>}
          <span>Vytvorené {fmtDate(o.createdAt, 'd. M.')}</span>
        </div>
      </button>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
        <span className="text-sm">
          <b className="tabular">{fmtMoney(o.total)}</b>
          {o.paid ? (
            <span className="ml-2 text-xs text-emerald-600">zaplatené</span>
          ) : o.deposit ? (
            <span className="ml-2 text-xs text-muted">záloha {fmtMoney(o.deposit)}</span>
          ) : null}
        </span>
        {step && (
          <Button size="sm" variant="soft" icon={step.icon} onClick={() => run(() => setOrderStatus(o, step.status), `Označené: ${step.label}`)}>
            {step.label}
          </Button>
        )}
        {o.status === 'dorucena' && (
          <Button size="sm" variant="soft" icon={<PackageCheck className="size-4" />} onClick={onOpen}>
            Vydať
          </Button>
        )}
      </div>
    </div>
  );
}

function emptyOrder(): OrderInput {
  return {
    status: 'nova',
    customerId: null,
    customer: { name: '', phone: '', email: '' },
    items: [],
    supplier: '',
    deposit: 0,
    paid: false,
    paymentMethod: null,
    paidAt: null,
    expectedAt: null,
    orderedAt: null,
    deliveredAt: null,
    notes: '',
  };
}

function OrderDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { orders, settings } = useData();
  const { isOwner } = useAuth();
  const navigate = useNavigate();
  const { run, confirm, toast } = useFeedback();
  const cached = id ? orders.find((o) => o.id === id) : undefined;
  const live = useLiveDoc<Order>(id && !cached ? doc(db, 'orders', id) : null, id && !cached ? id : 'none');
  const order = cached ?? live.data ?? null;
  const [draft, setDraft] = useState<OrderInput>(emptyOrder);
  const [saving, setSaving] = useState(false);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('hotovost');

  useEffect(() => {
    if (order) {
      const {
        id: _id,
        number: _n,
        seq: _s,
        keywords: _k,
        total: _t,
        totalCost: _c,
        createdAt: _ca,
        updatedAt: _u,
        history: _h,
        closedAt: _cl,
        createdBy: _cb,
        ...rest
      } = order;
      setDraft({ ...emptyOrder(), ...rest });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id]);

  const set = <K extends keyof OrderInput>(k: K, v: OrderInput[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const total = draft.items.reduce((s, i) => s + i.qty * i.price, 0);

  const save = async (extra?: Partial<OrderInput>, note?: string) => {
    if (!draft.customer.name.trim()) return toast('Zadajte meno zákazníka.', 'error');
    if (!draft.items.length || draft.items.some((i) => !i.name.trim())) return toast('Pridajte aspoň jednu položku s názvom.', 'error');
    setSaving(true);
    const data = { ...draft, ...extra };
    const ok = order
      ? await run(() => updateOrder(order, data, note), 'Objednávka uložená')
      : await run(async () => {
          const r = await createOrder(data, settings.orderPrefix);
          toast(`Objednávka ${r.number} vytvorená`);
          return r;
        });
    setSaving(false);
    if (ok !== undefined) onClose();
  };

  const remove = async () => {
    if (!order) return;
    if (await confirm({ title: `Vymazať objednávku ${order.number}?`, confirmLabel: 'Vymazať', danger: true })) {
      await run(() => deleteOrder(order.id), 'Vymazané');
      onClose();
    }
  };

  const message = order
    ? fillTemplate(settings.smsOrderTemplate, { cislo: order.number, polozky: order.items.map((i) => i.name).join(', '), firma: settings.name })
    : '';

  return (
    <Modal
      open
      onClose={onClose}
      side="right"
      size="lg"
      title={order ? `Objednávka ${order.number}` : 'Nová objednávka'}
      footer={
        <>
          {order && isOwner && (
            <Button variant="ghost" className="mr-auto text-red-600" icon={<Trash2 className="size-4" />} onClick={remove}>
              Vymazať
            </Button>
          )}
          <Button onClick={onClose}>Zavrieť</Button>
          <Button variant="primary" loading={saving} onClick={() => save()}>
            {order ? 'Uložiť' : 'Vytvoriť objednávku'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {order && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {ORDER_STATUSES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => s.id !== order.status && run(() => setOrderStatus(order, s.id), 'Stav zmenený')}
                  className={cx(
                    'rounded-xl border px-3 py-1.5 text-sm font-medium',
                    order.status === s.id ? 'border-primary bg-primary text-primary-fg' : 'border-line text-muted hover:text-fg',
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {order.status === 'dorucena' && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                <p className="mb-2 text-sm font-medium">Tovar dorazil – dajte vedieť zákazníkovi:</p>
                <ContactButtons phone={order.customer.phone} message={message} compact />
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-emerald-200 pt-3 dark:border-emerald-500/30">
                  <span className="text-sm">Vydať a zaplatiť:</span>
                  {PAYMENT_METHODS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setPayMethod(p.id)}
                      className={cx(
                        'rounded-lg border px-2.5 py-1 text-xs font-medium',
                        payMethod === p.id ? 'border-primary bg-primary-soft text-primary' : 'border-line bg-surface',
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                  <Button size="sm" variant="primary" onClick={() => save({ status: 'vydana', paid: true, paymentMethod: payMethod }, 'Vydané zákazníkovi')}>
                    Vydať ({fmtMoney(Math.max(0, total - (draft.deposit || 0)))})
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <div>
          <p className="mb-2 text-sm font-semibold">Zákazník</p>
          <CustomerPicker value={draft.customer} onChange={(c) => set('customer', c)} />
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">Položky</p>
          <ItemsEditor items={draft.items} onChange={(items) => set('items', items)} defaultKind="tovar" showPartStatus={false} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="Dodávateľ" value={draft.supplier ?? ''} onChange={(e) => set('supplier', e.target.value)} placeholder="napr. Hurtel" />
          <Input
            label="Očakávané doručenie"
            type="date"
            value={toDateInput(draft.expectedAt)}
            onChange={(e) => set('expectedAt', e.target.value ? Timestamp.fromDate(endOfDay(new Date(e.target.value + 'T12:00'))) : null)}
          />
          <Input label="Záloha" inputMode="decimal" suffix="€" value={draft.deposit || ''} onChange={(e) => set('deposit', parseNum(e.target.value))} />
        </div>
        <Textarea label="Poznámka" value={draft.notes ?? ''} onChange={(e) => set('notes', e.target.value)} rows={2} />
        {order?.status === 'vydana' && (
          <Button size="sm" icon={<ShieldAlert className="size-4" />} onClick={() => navigate(`/reklamacie/nova?objednavka=${order.id}`)}>
            Prijať reklamáciu tohto tovaru
          </Button>
        )}
        {order?.paid && (
          <Badge tone="green">Zaplatené{order.paymentMethod ? ` – ${PAYMENT_METHODS.find((p) => p.id === order.paymentMethod)?.label}` : ''}</Badge>
        )}
        {order && order.history?.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-semibold">História</p>
            <ul className="space-y-1 text-sm text-muted">
              {[...order.history].reverse().map((h, i) => (
                <li key={i}>
                  {fmtDate(h.at, 'd. M. HH:mm')} – {h.text} <span className="text-subtle">({h.by})</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
