import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { endOfMonth, format, isSameDay, startOfMonth } from 'date-fns';
import { sk } from 'date-fns/locale';
import {
  AlarmClock,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Circle,
  Hourglass,
  Package,
  PackageCheck,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Wrench,
} from 'lucide-react';
import { useAuth } from '@/features/auth';
import { useData } from '@/features/data';
import { attention, isRepairOpen, repairAmount, revenue } from '@/features/metrics';
import { useShell } from '@/components/Layout';
import { Badge, Button, Card, EmptyState, StatCard, cx } from '@/components/ui';
import { ContactButtons, DueChip, RepairStatusBadge, fillTemplate } from '@/components/domain';
import { useFeedback } from '@/components/feedback';
import { toggleEventDone } from '@/lib/db';
import { eventType } from '@/lib/constants';
import { fmtMoney, fmtTime, toDate } from '@/lib/format';
import { useNow } from '@/lib/hooks';
import type { Order, Repair } from '@/lib/types';

export function DashboardPage() {
  const { user, member } = useAuth();
  const { repairs, orders, events, settings } = useData();
  const shell = useShell();
  const navigate = useNavigate();
  const now = useNow();
  const { run } = useFeedback();

  const open = repairs.filter(isRepairOpen);
  const att = useMemo(() => attention(repairs, orders), [repairs, orders]);
  const month = useMemo(() => revenue(repairs, orders, startOfMonth(now), endOfMonth(now)), [repairs, orders, now]);
  const firstName = (member?.name || user?.displayName || '').split(' ')[0];

  const today = useMemo(() => {
    const ev = events
      .filter((e) => e.type !== 'uloha' && isSameDay(toDate(e.start)!, now))
      .sort((a, b) => a.start.toMillis() - b.start.toMillis());
    const due = open.filter((r) => r.dueAt && isSameDay(toDate(r.dueAt)!, now));
    return { ev, due };
  }, [events, open, now]);

  const tasks = useMemo(
    () =>
      events
        .filter((e) => e.type === 'uloha' && (!e.done || isSameDay(toDate(e.updatedAt) ?? new Date(0), now)))
        .sort((a, b) => Number(a.done) - Number(b.done) || a.start.toMillis() - b.start.toMillis())
        .slice(0, 8),
    [events, now],
  );

  const readyMsg = (r: Repair) =>
    fillTemplate(settings.smsReadyTemplate, {
      zariadenie: `${r.device.brand} ${r.device.model}`.trim(),
      cislo: r.number,
      cena: fmtMoney(repairAmount(r) - (r.deposit || 0)),
      firma: settings.name,
    });
  const orderMsg = (o: Order) =>
    fillTemplate(settings.smsOrderTemplate, { cislo: o.number, polozky: o.items.map((i) => i.name).join(', '), firma: settings.name });

  const attentionCount =
    att.overdue.length + att.partsToOrder.length + att.awaitingApproval.length + att.ready.length + att.ordersToOrder.length + att.ordersArrived.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted first-letter:uppercase">{format(now, 'EEEE d. MMMM yyyy', { locale: sk })}</p>
          <h1 className="text-2xl font-bold tracking-tight">{greeting(now)}{firstName ? `, ${firstName}` : ''}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="primary" icon={<Wrench className="size-4" />} onClick={() => navigate('/zakazky/nova')}>
            Nová zákazka
          </Button>
          <Button icon={<Package className="size-4" />} onClick={() => navigate('/objednavky?nova=1')} className="hidden sm:inline-flex">
            Objednávka
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Rozpracované zákazky"
          value={open.length}
          hint={`${att.ready.length} hotových na vyzdvihnutie`}
          icon={<Wrench className="size-4" />}
          tone="orange"
          onClick={() => navigate('/zakazky')}
        />
        <StatCard
          label="Po termíne"
          value={<span className={att.overdue.length ? 'text-red-600 dark:text-red-400' : ''}>{att.overdue.length}</span>}
          hint={att.overdue.length ? 'Treba riešiť' : 'Všetko v termíne'}
          icon={<AlarmClock className="size-4" />}
          tone={att.overdue.length ? 'red' : 'green'}
          onClick={() => navigate('/zakazky?filter=po_termine')}
        />
        <StatCard
          label="Objednávky na vybavenie"
          value={att.ordersToOrder.length + att.ordersArrived.length}
          hint={`${att.ordersToOrder.length} objednať · ${att.ordersArrived.length} doručených`}
          icon={<ShoppingCart className="size-4" />}
          tone="blue"
          onClick={() => navigate('/objednavky')}
        />
        <StatCard
          label={`Tržby – ${format(now, 'LLLL', { locale: sk })}`}
          value={fmtMoney(month.revenue)}
          hint={`Zisk ${fmtMoney(month.profit)}`}
          icon={<TrendingUp className="size-4" />}
          tone="green"
          onClick={() => navigate('/statistiky')}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Vyžaduje pozornosť" icon={<AlarmClock className="size-4" />} bodyClass="p-0" actions={attentionCount ? <Badge tone="orange" dot={false}>{attentionCount}</Badge> : null}>
            {attentionCount === 0 ? (
              <EmptyState icon={<CheckCircle2 />} title="Všetko je vybavené" text="Žiadne zákazky po termíne ani čakajúce objednávky." />
            ) : (
              <div className="divide-y divide-line">
                <AttentionGroup title="Po termíne" tone="text-red-600 dark:text-red-400" items={att.overdue} render={(r) => <RepairRow r={r} />} />
                <AttentionGroup
                  title="Hotové – dať vedieť zákazníkovi"
                  tone="text-emerald-600 dark:text-emerald-400"
                  items={att.ready}
                  render={(r) => <RepairRow r={r} extra={<ContactButtons phone={r.customer.phone} message={readyMsg(r)} compact />} />}
                />
                <AttentionGroup
                  title="Diely na objednanie"
                  tone="text-amber-600 dark:text-amber-400"
                  items={att.partsToOrder}
                  render={(r) => (
                    <RepairRow
                      r={r}
                      extra={
                        <span className="text-xs text-muted">
                          {r.items
                            .filter((i) => i.kind === 'diel' && i.partStatus === 'treba_objednat')
                            .map((i) => i.name)
                            .join(', ')}
                        </span>
                      }
                    />
                  )}
                />
                <AttentionGroup title="Čaká na schválenie zákazníkom" tone="text-violet-600 dark:text-violet-400" items={att.awaitingApproval} render={(r) => <RepairRow r={r} extra={<ContactButtons phone={r.customer.phone} compact />} />} />
                <AttentionGroup title="Objednávky – treba objednať" tone="text-amber-600 dark:text-amber-400" items={att.ordersToOrder} render={(o) => <OrderRow o={o} />} />
                <AttentionGroup
                  title="Objednávky – doručené, na vyzdvihnutie"
                  tone="text-emerald-600 dark:text-emerald-400"
                  items={att.ordersArrived}
                  render={(o) => <OrderRow o={o} extra={<ContactButtons phone={o.customer.phone} message={orderMsg(o)} compact />} />}
                />
              </div>
            )}
          </Card>

          <Card
            title="Rozpracované zákazky"
            icon={<Hourglass className="size-4" />}
            bodyClass="p-0"
            actions={
              <Link to="/zakazky" className="flex items-center gap-1 text-sm font-medium text-primary">
                Všetky <ArrowRight className="size-4" />
              </Link>
            }
          >
            {open.length === 0 ? (
              <EmptyState icon={<Wrench />} title="Žiadne rozpracované zákazky" action={<Button variant="primary" onClick={() => navigate('/zakazky/nova')}>Prijať zariadenie</Button>} />
            ) : (
              <div className="divide-y divide-line">
                {[...open]
                  .sort((a, b) => (toDate(a.dueAt)?.getTime() ?? Infinity) - (toDate(b.dueAt)?.getTime() ?? Infinity))
                  .slice(0, 8)
                  .map((r) => (
                    <RepairRow key={r.id} r={r} />
                  ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card
            title="Dnes"
            icon={<CalendarDays className="size-4" />}
            bodyClass="p-0"
            actions={
              <Link to="/kalendar" className="flex items-center gap-1 text-sm font-medium text-primary">
                Kalendár <ArrowRight className="size-4" />
              </Link>
            }
          >
            {today.ev.length === 0 && today.due.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">Na dnes nemáte nič naplánované.</p>
            ) : (
              <ul className="divide-y divide-line">
                {today.ev.map((e) => (
                  <li key={e.id} className="flex items-start gap-3 px-4 py-3">
                    <span className="w-12 shrink-0 pt-0.5 text-sm font-semibold tabular">{e.allDay ? 'celý deň' : fmtTime(e.start)}</span>
                    <div className="min-w-0 flex-1">
                      <p className={cx('truncate text-sm font-medium', e.done && 'text-muted line-through')}>{e.title}</p>
                      <p className="text-xs text-muted">
                        {eventType(e.type).label}
                        {e.repairNumber && (
                          <>
                            {' · '}
                            <Link to={`/zakazky/${e.repairId}`} className="text-primary">
                              {e.repairNumber}
                            </Link>
                          </>
                        )}
                      </p>
                    </div>
                  </li>
                ))}
                {today.due.map((r) => (
                  <li key={r.id} className="flex items-start gap-3 px-4 py-3">
                    <span className="w-12 shrink-0 pt-0.5 text-xs font-semibold text-orange-600">termín</span>
                    <Link to={`/zakazky/${r.id}`} className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {r.number} · {r.device.brand} {r.device.model}
                      </p>
                      <p className="text-xs text-muted">{r.customer.name}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="Úlohy"
            icon={<CheckCircle2 className="size-4" />}
            bodyClass="p-0"
            actions={
              <Button size="sm" variant="ghost" onClick={() => navigate('/kalendar?nova=uloha')}>
                + Pridať
              </Button>
            }
          >
            {tasks.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">Žiadne otvorené úlohy.</p>
            ) : (
              <ul className="divide-y divide-line">
                {tasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                    <button onClick={() => run(() => toggleEventDone(t))} aria-label={t.done ? 'Označiť ako nesplnené' : 'Označiť ako splnené'}>
                      {t.done ? <CheckCircle2 className="size-5 text-emerald-500" /> : <Circle className="size-5 text-subtle" />}
                    </button>
                    <span className={cx('min-w-0 flex-1 truncate text-sm', t.done && 'text-muted line-through')}>{t.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="rounded-2xl border border-primary/20 bg-primary-soft p-4">
            <div className="mb-2 flex items-center gap-2 font-semibold text-primary">
              <Sparkles className="size-4" /> AI asistent
            </div>
            <p className="mb-3 text-sm text-muted">Spýtajte sa čokoľvek o zákazkách, objednávkach alebo tržbách – alebo mu zadiktujte novú zákazku.</p>
            <div className="flex flex-wrap gap-2">
              {['Čo mám dnes urobiť?', 'Aké diely treba objednať?', 'Ako sa nám darí tento mesiac?'].map((q) => (
                <button key={q} onClick={() => shell.openAssistant(q)} className="rounded-full border border-primary/20 bg-surface px-3 py-1.5 text-xs font-medium hover:border-primary">
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function greeting(d: Date) {
  const h = d.getHours();
  if (h < 10) return 'Dobré ráno';
  if (h < 18) return 'Dobrý deň';
  return 'Dobrý večer';
}

function AttentionGroup<T extends { id: string }>({ title, tone, items, render }: { title: string; tone: string; items: T[]; render: (item: T) => ReactNode }) {
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  const shown = all ? items : items.slice(0, 4);
  return (
    <div className="py-1">
      <div className={cx('flex items-center justify-between px-4 pt-2 text-xs font-semibold tracking-wide uppercase', tone)}>
        <span>
          {title} · {items.length}
        </span>
        {items.length > 4 && (
          <button className="font-medium text-muted normal-case" onClick={() => setAll(!all)}>
            {all ? 'Menej' : 'Všetky'}
          </button>
        )}
      </div>
      {shown.map((i) => (
        <div key={i.id}>{render(i)}</div>
      ))}
    </div>
  );
}

function RepairRow({ r, extra }: { r: Repair; extra?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center">
      <Link to={`/zakazky/${r.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <span className="w-16 shrink-0 text-sm font-semibold text-primary tabular">{r.number}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {r.device.brand} {r.device.model}
            <span className="font-normal text-muted"> · {r.problem}</span>
          </span>
          <span className="block truncate text-xs text-muted">{r.customer.name}</span>
        </span>
        <span className="hidden sm:block">
          <DueChip due={r.dueAt} open />
        </span>
        <RepairStatusBadge status={r.status} />
      </Link>
      {extra && <div className="pl-[76px] sm:pl-0">{extra}</div>}
    </div>
  );
}

function OrderRow({ o, extra }: { o: Order; extra?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center">
      <Link to={`/objednavky/${o.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <span className="w-16 shrink-0 text-sm font-semibold text-primary tabular">{o.number}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{o.items.map((i) => i.name).join(', ') || 'Bez položiek'}</span>
          <span className="block truncate text-xs text-muted">
            {o.customer.name}
            {o.supplier ? ` · ${o.supplier}` : ''}
          </span>
        </span>
        <PackageCheck className="size-4 text-muted" />
      </Link>
      {extra && <div className="pl-[76px] sm:pl-0">{extra}</div>}
    </div>
  );
}
