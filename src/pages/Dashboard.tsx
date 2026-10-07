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
  ClipboardList,
  MessageCircleQuestion,
  Package,
  PackageCheck,
  PackageOpen,
  PartyPopper,
  PhoneCall,
  ShieldAlert,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  UserRound,
  Wrench,
} from 'lucide-react';
import { useAuth } from '@/features/auth';
import { useData } from '@/features/data';
import { attention, claimDeadline, isClaim, isRepairOpen, partNeedsOrder, repairAmount, revenue, watchesDue } from '@/features/metrics';
import { DeadlineChip } from '@/features/ClaimPanel';
import { useShell } from '@/components/Layout';
import { Button, StatCard, cx, toneBg, toneBorder, toneDot } from '@/components/ui';
import { ContactButtons, DueChip, RepairStatusBadge, fillTemplate } from '@/components/domain';
import { useFeedback } from '@/components/feedback';
import { toggleEventDone } from '@/lib/db';
import { REPAIR_STATUSES, eventType, type Tone } from '@/lib/constants';
import { fmtMoney, fmtTime, toDate } from '@/lib/format';
import { useNow } from '@/lib/hooks';
import { statusUrl } from '@/lib/links';
import type { CalendarEvent, Order, Repair, RepairStatus } from '@/lib/types';

export function DashboardPage() {
  const { user, member } = useAuth();
  const { repairs, orders, events, settings } = useData();
  const shell = useShell();
  const navigate = useNavigate();
  const now = useNow();
  const { run } = useFeedback();

  const open = useMemo(() => repairs.filter(isRepairOpen), [repairs]);
  const att = useMemo(() => attention(repairs, orders), [repairs, orders]);
  const announced = useMemo(() => open.filter((r) => r.status === 'oznamene'), [open]);
  const claims = useMemo(() => open.filter((r) => isClaim(r) && r.status !== 'hotove').sort((a, b) => claimDeadline(a).getTime() - claimDeadline(b).getTime()), [open]);
  const month = useMemo(() => revenue(repairs, orders, startOfMonth(now), endOfMonth(now)), [repairs, orders, now]);
  const firstName = (member?.name || user?.displayName || '').split(' ')[0];

  const today = useMemo(() => {
    const ev = events
      .filter((e) => e.type !== 'uloha' && isSameDay(toDate(e.start)!, now))
      .sort((a, b) => Number(!a.allDay) - Number(!b.allDay) || a.start.toMillis() - b.start.toMillis());
    const due = open.filter((r) => watchesDue(r) && r.dueAt && isSameDay(toDate(r.dueAt)!, now));
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
      odkaz: statusUrl(r.id),
    });
  const orderMsg = (o: Order) =>
    fillTemplate(settings.smsOrderTemplate, { cislo: o.number, polozky: o.items.map((i) => i.name).join(', '), firma: settings.name });

  const tiles: { key: string; tone: Tone; icon: ReactNode; title: string; hint: string; items: ReactNode[]; to: string }[] = [
    {
      key: 'overdue',
      tone: 'red' as Tone,
      icon: <AlarmClock className="size-4" />,
      title: 'Po termíne',
      hint: 'Zákazník už čaká – dokončiť alebo dať vedieť',
      items: att.overdue.map((r) => <RepairMini key={r.id} r={r} extra={<DueChip due={r.dueAt} open />} />),
      to: '/zakazky?filter=po_termine',
    },
    {
      key: 'claims',
      tone: 'blue' as Tone,
      icon: <ShieldAlert className="size-4" />,
      title: 'Reklamácie na vybavenie',
      hint: 'Zákonná lehota 30 dní',
      items: claims.map((r) => <RepairMini key={r.id} r={r} extra={<DeadlineChip r={r} />} />),
      to: '/reklamacie',
    },
    {
      key: 'ready',
      tone: 'green' as Tone,
      icon: <PhoneCall className="size-4" />,
      title: 'Hotové – dať vedieť zákazníkovi',
      hint: 'Čakajú na vyzdvihnutie',
      items: att.ready.map((r) => <RepairMini key={r.id} r={r} extra={<ContactButtons phone={r.customer.phone} message={readyMsg(r)} iconsOnly />} />),
      to: '/zakazky?filter=hotove',
    },
    {
      key: 'approval',
      tone: 'violet' as Tone,
      icon: <MessageCircleQuestion className="size-4" />,
      title: 'Čaká na schválenie ceny',
      hint: 'Zákazník musí odsúhlasiť opravu',
      items: att.awaitingApproval.map((r) => <RepairMini key={r.id} r={r} extra={<ContactButtons phone={r.customer.phone} iconsOnly />} />),
      to: '/zakazky?filter=caka_schvalenie',
    },
    {
      key: 'parts',
      tone: 'amber' as Tone,
      icon: <ShoppingCart className="size-4" />,
      title: 'Diely na objednanie',
      hint: 'Pre rozpracované zákazky',
      items: att.partsToOrder.map((r) => (
        <RepairMini
          key={r.id}
          r={r}
          sub={r.items
            .filter(partNeedsOrder)
            .map((i) => i.name)
            .join(', ')}
        />
      )),
      to: '/objednavky?typ=diely',
    },
    {
      key: 'ordersToOrder',
      tone: 'orange' as Tone,
      icon: <Package className="size-4" />,
      title: 'Objednávky – treba objednať',
      hint: 'Tovar pre zákazníkov',
      items: att.ordersToOrder.map((o) => <OrderMini key={o.id} o={o} />),
      to: '/objednavky?typ=tovar',
    },
    {
      key: 'ordersArrived',
      tone: 'cyan' as Tone,
      icon: <PackageCheck className="size-4" />,
      title: 'Objednávky – doručené',
      hint: 'Dať vedieť zákazníkovi',
      items: att.ordersArrived.map((o) => <OrderMini key={o.id} o={o} extra={<ContactButtons phone={o.customer.phone} message={orderMsg(o)} iconsOnly />} />),
      to: '/objednavky',
    },
    {
      key: 'announced',
      tone: 'pink' as Tone,
      icon: <PackageOpen className="size-4" />,
      title: 'Oznámené – čakáme na zariadenie',
      hint: 'Zákazník ho ešte prinesie',
      items: announced.map((r) => <RepairMini key={r.id} r={r} extra={r.dueAt ? <DueChip due={r.dueAt} open={false} /> : undefined} />),
      to: '/zakazky?filter=oznamene',
    },
  ].filter((t) => t.items.length > 0);
  const attentionCount = tiles.filter((t) => t.key !== 'announced').reduce((s, t) => s + t.items.length, 0);

  const todayCard = <TodayCard ev={today.ev} due={today.due} />;

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted first-letter:uppercase">{format(now, 'EEEE d. MMMM yyyy', { locale: sk })}</p>
          <h1 className="text-2xl font-bold tracking-tight">
            {greeting(now)}
            {firstName ? `, ${firstName}` : ''}
          </h1>
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
        <StatCard label="Rozpracované zákazky" value={open.length} hint={`${att.ready.length} hotových na vyzdvihnutie`} icon={<Wrench className="size-4" />} tone="orange" onClick={() => navigate('/zakazky')} />
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

      <div className="grid gap-7 lg:grid-cols-3">
        <div className="space-y-7 lg:col-span-2">
          <section>
            <SectionTitle icon={<ClipboardList className="size-5" />} title="Treba vybaviť" count={attentionCount} />
            {tiles.length === 0 ? (
              <div className="flex items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 dark:border-emerald-500/25 dark:bg-emerald-500/10">
                <PartyPopper className="size-7 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <p className="font-semibold text-emerald-900 dark:text-emerald-200">Všetko je vybavené</p>
                  <p className="text-sm text-emerald-800/80 dark:text-emerald-200/70">Žiadne zákazky po termíne, nič na objednanie ani na vyzdvihnutie.</p>
                </div>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {tiles.map(({ key, ...t }) => (
                  <AttentionTile key={key} {...t} />
                ))}
              </div>
            )}
          </section>

          <div className="lg:hidden">{todayCard}</div>

          <WorkInProgress open={open} />
        </div>

        <aside className="space-y-6">
          <div className="hidden lg:block">{todayCard}</div>

          <Panel
            title="Úlohy"
            icon={<CheckCircle2 className="size-4" />}
            action={
              <button className="text-sm font-medium text-primary" onClick={() => navigate('/kalendar?nova=uloha')}>
                + Pridať
              </button>
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
          </Panel>

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
        </aside>
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

function SectionTitle({ icon, title, count, action }: { icon: ReactNode; title: string; count?: number; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="text-muted">{icon}</span>
      <h2 className="text-lg font-bold tracking-tight">{title}</h2>
      {!!count && <span className="rounded-full bg-fg px-2 py-0.5 text-xs font-bold text-bg tabular">{count}</span>}
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}

function Panel({ title, icon, action, children }: { title: string; icon: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="text-muted">{icon}</span>
        <h2 className="flex-1 text-[15px] font-semibold">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

/** Dlaždica „na vybavenie“: farebná hlavička odlišuje druh úlohy na prvý pohľad. */
function AttentionTile({ tone, icon, title, hint, items, to }: { tone: Tone; icon: ReactNode; title: string; hint: string; items: ReactNode[]; to: string }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 3);
  return (
    <section className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
      <header className={cx('flex items-center gap-3 px-4 py-3', toneBg[tone])}>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-white/80 dark:bg-black/25">{icon}</span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-bold">{title}</h3>
          <p className="truncate text-xs opacity-80">{hint}</p>
        </div>
        <span className="text-2xl font-bold tabular">{items.length}</span>
      </header>
      <div className="flex-1 divide-y divide-line">{shown}</div>
      {items.length > 3 ? (
        <button onClick={() => setAll(!all)} className="border-t border-line px-4 py-2 text-left text-xs font-semibold text-muted hover:text-fg">
          {all ? 'Zobraziť menej' : `Zobraziť všetky (${items.length})`}
        </button>
      ) : (
        <Link to={to} className="border-t border-line px-4 py-2 text-xs font-semibold text-muted hover:text-fg">
          Otvoriť zoznam →
        </Link>
      )}
    </section>
  );
}

function RepairMini({ r, extra, sub }: { r: Repair; extra?: ReactNode; sub?: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <Link to={`/zakazky/${r.id}`} className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">
          <span className="text-primary tabular">{r.number}</span> · {r.device.brand} {r.device.model}
        </span>
        <span className="block truncate text-xs text-muted">{sub || `${r.customer.name} · ${r.problem}`}</span>
      </Link>
      {extra}
    </div>
  );
}

function OrderMini({ o, extra }: { o: Order; extra?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <Link to={`/objednavky/${o.id}`} className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">
          <span className="text-primary tabular">{o.number}</span> · {o.items.map((i) => i.name).join(', ') || 'Bez položiek'}
        </span>
        <span className="block truncate text-xs text-muted">
          {o.customer.name}
          {o.supplier ? ` · ${o.supplier}` : ''}
        </span>
      </Link>
      {extra}
    </div>
  );
}

/** Rozpracované zákazky ako karty s filtrom podľa stavu – iný vzhľad ako zoznamy úloh vyššie. */
function WorkInProgress({ open }: { open: Repair[] }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<RepairStatus | 'all'>('all');
  const [more, setMore] = useState(false);
  const counts = useMemo(() => {
    const c: Partial<Record<RepairStatus, number>> = {};
    for (const r of open) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [open]);
  const list = useMemo(
    () =>
      open
        .filter((r) => status === 'all' || r.status === status)
        .sort((a, b) => (toDate(a.dueAt)?.getTime() ?? Infinity) - (toDate(b.dueAt)?.getTime() ?? Infinity) || b.seq - a.seq),
    [open, status],
  );
  const limit = more ? 24 : 6;

  return (
    <section>
      <SectionTitle
        icon={<Wrench className="size-5" />}
        title="Rozpracované zákazky"
        count={open.length}
        action={
          <Link to="/zakazky" className="flex items-center gap-1 text-sm font-medium text-primary">
            Všetky <ArrowRight className="size-4" />
          </Link>
        }
      />
      {open.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line px-5 py-8 text-center">
          <p className="font-semibold">Žiadne rozpracované zákazky</p>
          <Button variant="primary" className="mt-3" onClick={() => navigate('/zakazky/nova')}>
            Prijať zariadenie
          </Button>
        </div>
      ) : (
        <>
          <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <Chip active={status === 'all'} onClick={() => setStatus('all')} label="Všetky" count={open.length} />
            {REPAIR_STATUSES.filter((s) => s.open && counts[s.id]).map((s) => (
              <Chip key={s.id} active={status === s.id} onClick={() => setStatus(s.id)} label={s.short} count={counts[s.id]!} dot={toneDot[s.tone]} />
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.slice(0, limit).map((r) => (
              <RepairCard key={r.id} r={r} />
            ))}
          </div>
          {list.length > limit && (
            <button onClick={() => (more ? navigate('/zakazky') : setMore(true))} className="mt-3 w-full rounded-xl border border-line bg-surface py-2 text-sm font-medium text-muted hover:text-fg">
              {more ? 'Otvoriť všetky zákazky' : `Zobraziť ďalšie (${list.length - limit})`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function Chip({ active, onClick, label, count, dot }: { active: boolean; onClick: () => void; label: string; count: number; dot?: string }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium whitespace-nowrap transition-colors',
        active ? 'border-fg bg-fg text-bg' : 'border-line bg-surface text-muted hover:text-fg',
      )}
    >
      {dot && <span className={cx('size-2 rounded-full', dot)} />}
      {label}
      <span className="tabular opacity-70">{count}</span>
    </button>
  );
}

function RepairCard({ r }: { r: Repair }) {
  const s = REPAIR_STATUSES.find((x) => x.id === r.status);
  return (
    <Link
      to={`/zakazky/${r.id}`}
      className={cx('flex min-h-32 flex-col rounded-2xl border border-l-4 border-line bg-surface p-3.5 shadow-xs transition-colors hover:border-primary/40', s && toneBorder[s.tone])}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-primary tabular">
          {r.number}
          {isClaim(r) && <span className="ml-1.5 rounded bg-rose-50 px-1 py-0.5 text-[10px] font-bold text-rose-700 uppercase dark:bg-rose-500/15 dark:text-rose-300">Reklamácia</span>}
        </span>
        <RepairStatusBadge status={r.status} />
      </div>
      <p className="mt-1.5 truncate font-semibold">
        {(r.priority === 'vysoka' || r.priority === 'urgentna') && (
          <span className={cx('mr-1.5 inline-block size-2 rounded-full align-middle', r.priority === 'urgentna' ? 'bg-red-500' : 'bg-orange-500')} />
        )}
        {r.device.brand} {r.device.model}
      </p>
      <p className="truncate text-sm text-muted">{r.problem}</p>
      <div className="mt-auto flex items-center justify-between gap-2 pt-2.5 text-xs">
        <span className="flex min-w-0 items-center gap-1 text-muted">
          <UserRound className="size-3.5 shrink-0" />
          <span className="truncate">{r.customer.name}</span>
        </span>
        <DueChip due={r.dueAt} open={watchesDue(r)} />
      </div>
    </Link>
  );
}

function TodayCard({ ev, due }: { ev: CalendarEvent[]; due: Repair[] }) {
  return (
    <Panel
      title="Dnes"
      icon={<CalendarDays className="size-4" />}
      action={
        <Link to="/kalendar" className="flex items-center gap-1 text-sm font-medium text-primary">
          Kalendár <ArrowRight className="size-4" />
        </Link>
      }
    >
      {ev.length === 0 && due.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted">Na dnes nemáte nič naplánované.</p>
      ) : (
        <ul className="space-y-0.5 p-2">
          {ev.map((e) => {
            const t = eventType(e.type);
            return (
              <li key={e.id}>
                <Link to={e.repairId ? `/zakazky/${e.repairId}` : '/kalendar'} className="flex items-stretch gap-3 rounded-xl px-2 py-2 hover:bg-surface-2">
                  <span className="w-11 shrink-0 pt-0.5 text-right text-sm font-semibold tabular">{e.allDay ? 'deň' : fmtTime(e.start)}</span>
                  <span className={cx('w-1 shrink-0 rounded-full', toneDot[t.tone])} />
                  <span className="min-w-0 flex-1">
                    <span className={cx('block truncate text-sm font-medium', e.done && 'text-muted line-through')}>{e.title}</span>
                    <span className="block truncate text-xs text-muted">
                      {t.label}
                      {e.repairNumber ? ` · ${e.repairNumber}` : ''}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
          {due.map((r) => (
            <li key={r.id}>
              <Link to={`/zakazky/${r.id}`} className="flex items-stretch gap-3 rounded-xl px-2 py-2 hover:bg-surface-2">
                <span className="w-11 shrink-0 pt-0.5 text-right text-xs font-semibold text-orange-600 dark:text-orange-400">termín</span>
                <span className="w-1 shrink-0 rounded-full bg-orange-500" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {r.number} · {r.device.brand} {r.device.model}
                  </span>
                  <span className="block truncate text-xs text-muted">{r.customer.name}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
