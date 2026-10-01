import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { query, Timestamp, where } from 'firebase/firestore';
import {
  addDays,
  addMinutes,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  differenceInMinutes,
  endOfMonth,
  endOfWeek,
  format,
  getISOWeek,
  isBefore,
  isSameDay,
  isSameMonth,
  isToday,
  isWeekend,
  setHours,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { sk } from 'date-fns/locale';
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Circle, GripHorizontal, ListTodo, Plus, Wrench } from 'lucide-react';
import { useData } from '@/features/data';
import { watchesDue } from '@/features/metrics';
import { EventDialog, type EventDraftInit } from '@/features/EventDialog';
import { Button, IconButton, Segmented, cx, toneDot } from '@/components/ui';
import { useFeedback } from '@/components/feedback';
import { col, moveEvent, toggleEventDone } from '@/lib/db';
import { EVENT_TYPES, eventType, type Tone } from '@/lib/constants';
import { fmtDay, fmtTime, toDate } from '@/lib/format';
import { useIsDesktop, useLiveQuery, useNow } from '@/lib/hooks';
import type { CalendarEvent, EventType, Repair } from '@/lib/types';

type View = 'den' | 'tyzden' | 'mesiac' | 'zoznam';
type Layer = EventType | 'zakazky';
const HOUR_PX = 60;
const SNAP_MIN = 15;
const WEEK = { weekStartsOn: 1 } as const;

/** Farby blokov v kalendári – sýtejšie ako odznaky, aby sa dali rozlíšiť aj na prvý pohľad. */
const BLOCK: Partial<Record<Tone, string>> = {
  orange: 'bg-orange-100 text-orange-950 border-l-orange-500 dark:bg-orange-500/20 dark:text-orange-50',
  blue: 'bg-blue-100 text-blue-950 border-l-blue-500 dark:bg-blue-500/20 dark:text-blue-50',
  violet: 'bg-violet-100 text-violet-950 border-l-violet-500 dark:bg-violet-500/20 dark:text-violet-50',
  gray: 'bg-stone-200/80 text-stone-900 border-l-stone-500 dark:bg-stone-500/25 dark:text-stone-50',
};
const block = (tone: Tone) => BLOCK[tone] ?? BLOCK.gray!;

const LAYERS: { id: Layer; label: string; dot: string }[] = [
  ...EVENT_TYPES.map((t) => ({ id: t.id as Layer, label: t.label, dot: toneDot[t.tone] })),
  { id: 'zakazky', label: 'Termíny zákaziek', dot: 'bg-orange-500 ring-2 ring-orange-200 dark:ring-orange-500/30' },
];

function loadHidden(): Layer[] {
  try {
    return JSON.parse(localStorage.getItem('cs-cal-hidden') || '[]');
  } catch {
    return [];
  }
}

export function CalendarPage() {
  const isDesktop = useIsDesktop();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<View>(() => (isDesktop ? 'tyzden' : 'den'));
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [dialog, setDialog] = useState<EventDraftInit | null>(null);
  const [hidden, setHidden] = useState<Layer[]>(loadHidden);
  const { repairs, events: recentEvents, settings } = useData();
  const { run } = useFeedback();

  useEffect(() => {
    try {
      localStorage.setItem('cs-cal-hidden', JSON.stringify(hidden));
    } catch {
      // nič
    }
  }, [hidden]);

  useEffect(() => {
    const nova = params.get('nova') as EventType | null;
    if (nova) {
      const start = nova === 'uloha' ? startOfDay(new Date()) : setHours(startOfDay(new Date()), Math.min(Math.max(new Date().getHours() + 1, settings.workdayStart), settings.workdayEnd - 1));
      setDialog({ type: nova, start, allDay: nova === 'uloha' });
      setParams({}, { replace: true });
    }
  }, [params, setParams, settings.workdayStart, settings.workdayEnd]);

  const range = useMemo(() => {
    if (view === 'mesiac') return { from: startOfWeek(startOfMonth(cursor), WEEK), to: addDays(endOfWeek(endOfMonth(cursor), WEEK), 1) };
    if (view === 'zoznam') return { from: startOfDay(cursor), to: addDays(startOfDay(cursor), 31) };
    // Deň aj týždeň načítajú celý týždeň (pásik dní ukazuje, kde niečo je).
    return { from: startOfWeek(cursor, WEEK), to: addDays(startOfWeek(cursor, WEEK), 7) };
  }, [view, cursor]);

  const live = useLiveQuery<CalendarEvent>(
    () => query(col.events(), where('start', '>=', Timestamp.fromDate(range.from)), where('start', '<', Timestamp.fromDate(range.to))),
    `cal-${range.from.getTime()}-${range.to.getTime()}`,
  );
  const events = useMemo(() => live.data.filter((e) => !hidden.includes(e.type)), [live.data, hidden]);
  const dueRepairs = useMemo(
    () => (hidden.includes('zakazky') ? [] : repairs.filter((r) => watchesDue(r) && r.dueAt && toDate(r.dueAt)! >= range.from && toDate(r.dueAt)! < range.to)),
    [repairs, range, hidden],
  );

  const move = (dir: 1 | -1) => {
    if (view === 'mesiac') setCursor((c) => addMonths(c, dir));
    else if (view === 'tyzden') setCursor((c) => addWeeks(c, dir));
    else if (view === 'den') setCursor((c) => addDays(c, dir));
    else setCursor((c) => addDays(c, dir * 30));
  };

  const thisYear = cursor.getFullYear() === new Date().getFullYear();
  const title =
    view === 'mesiac'
      ? format(cursor, 'LLLL yyyy', { locale: sk })
      : view === 'tyzden'
        ? `${format(range.from, 'd. M.')} – ${format(addDays(range.to, -1), thisYear ? 'd. M.' : 'd. M. yyyy')}`
        : view === 'den'
          ? format(cursor, thisYear ? 'EEEE d. MMMM' : 'EEEE d. MMMM yyyy', { locale: sk })
          : `${format(range.from, 'd. M.')} – ${format(addDays(range.to, -1), 'd. M. yyyy')}`;
  const subtitle = view === 'tyzden' ? `${getISOWeek(cursor)}. týždeň · ${format(cursor, 'LLLL yyyy', { locale: sk })}` : view === 'den' && isToday(cursor) ? 'Dnes' : null;

  const openEvent = (e: CalendarEvent) => setDialog({ ...e, start: e.start.toDate(), end: e.end.toDate() });
  const newAt = (d: Date, allDay = false) => setDialog({ type: 'termin', start: d, allDay });
  const toggle = (e: CalendarEvent) => run(() => toggleEventDone(e));

  // Úlohy: otvorené (vrátane starších) + dnes splnené.
  const tasks = useMemo(
    () =>
      recentEvents
        .filter((e) => e.type === 'uloha' && (!e.done || isSameDay(toDate(e.updatedAt) ?? new Date(0), new Date())))
        .sort((a, b) => Number(a.done) - Number(b.done) || a.start.toMillis() - b.start.toMillis()),
    [recentEvents],
  );

  const pickDay = (d: Date) => {
    setCursor(startOfDay(d));
    if (view === 'mesiac' && isDesktop) setView('den');
  };

  return (
    <div>
      {/* Hlavička: názov obdobia, posun, zobrazenie */}
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-1">
          <IconButton label="Predchádzajúce" onClick={() => move(-1)} className="-ml-2">
            <ChevronLeft className="size-5" />
          </IconButton>
          <IconButton label="Nasledujúce" onClick={() => move(1)}>
            <ChevronRight className="size-5" />
          </IconButton>
          <div className="ml-1 min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight first-letter:uppercase sm:text-2xl">{title}</h1>
            {subtitle && <p className="text-xs text-muted first-letter:uppercase">{subtitle}</p>}
          </div>
        </div>
        {!isSameDay(cursor, new Date()) && (
          <Button size="sm" className="ml-auto" onClick={() => setCursor(startOfDay(new Date()))}>
            Dnes
          </Button>
        )}
        <div className="flex w-full flex-wrap items-center gap-2">
          <Segmented
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { id: 'den', label: 'Deň' },
              { id: 'tyzden', label: 'Týždeň' },
              { id: 'mesiac', label: 'Mesiac' },
              { id: 'zoznam', label: 'Zoznam' },
            ]}
          />
          <div className="order-last -mx-1 flex w-full gap-1 overflow-x-auto scrollbar-none lg:order-none lg:mx-0 lg:w-auto lg:flex-1 lg:justify-end">
            {LAYERS.map((l) => {
              const off = hidden.includes(l.id);
              return (
                <button
                  key={l.id}
                  onClick={() => setHidden((h) => (off ? h.filter((x) => x !== l.id) : [...h, l.id]))}
                  className={cx('flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors', off ? 'text-subtle line-through' : 'text-muted hover:bg-surface-2')}
                  title={off ? 'Zobraziť' : 'Skryť'}
                >
                  <span className={cx('size-2.5 rounded-full', l.dot, off && 'opacity-30')} />
                  {l.label}
                </button>
              );
            })}
          </div>
          <Button
            size="sm"
            variant="primary"
            className="ml-auto inline-flex lg:ml-0"
            icon={<Plus className="size-4" />}
            onClick={() => newAt(setHours(startOfDay(cursor), Math.max(settings.workdayStart, isToday(cursor) ? new Date().getHours() + 1 : settings.workdayStart + 1)))}
            aria-label="Nová udalosť"
          >
            <span className="hidden sm:inline">Nová udalosť</span>
          </Button>
        </div>
      </div>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          {view === 'den' && (
            <div className="space-y-3">
              <WeekStrip cursor={cursor} events={live.data} dueRepairs={dueRepairs} onPick={pickDay} onSwipe={(dir) => setCursor((c) => addWeeks(c, dir))} />
              <TimeGrid
                days={[cursor]}
                events={events}
                dueRepairs={dueRepairs}
                startHour={settings.workdayStart}
                endHour={settings.workdayEnd}
                onOpen={openEvent}
                onNew={newAt}
                onToggle={toggle}
              />
            </div>
          )}
          {view === 'tyzden' && (
            <TimeGrid
              days={Array.from({ length: 7 }, (_, i) => addDays(range.from, i))}
              events={events}
              dueRepairs={dueRepairs}
              startHour={settings.workdayStart}
              endHour={settings.workdayEnd}
              onOpen={openEvent}
              onNew={newAt}
              onToggle={toggle}
              onDayClick={(d) => {
                setCursor(d);
                setView('den');
              }}
            />
          )}
          {view === 'mesiac' && (
            <div className="space-y-4">
              <MonthView cursor={cursor} from={range.from} events={events} dueRepairs={dueRepairs} onOpen={openEvent} onDay={pickDay} onNew={(d) => newAt(setHours(d, settings.workdayStart + 1))} />
              {!isDesktop && <DayAgenda day={cursor} events={events} dueRepairs={dueRepairs} onOpen={openEvent} onToggle={toggle} showEmpty />}
            </div>
          )}
          {view === 'zoznam' && <AgendaView from={range.from} days={31} events={events} dueRepairs={dueRepairs} onOpen={openEvent} onToggle={toggle} />}
        </div>

        <aside className="space-y-5">
          <div className="hidden rounded-2xl border border-line bg-surface p-3 shadow-xs 2xl:block">
            <MiniMonth cursor={cursor} events={live.data} onPick={pickDay} />
          </div>
          <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
            <header className="flex items-center gap-2 border-b border-line px-4 py-3">
              <ListTodo className="size-4 text-muted" />
              <h2 className="flex-1 text-[15px] font-semibold">Úlohy</h2>
              <IconButton label="Pridať úlohu" size="sm" onClick={() => setDialog({ type: 'uloha', start: startOfDay(new Date()), allDay: true })}>
                <Plus className="size-4" />
              </IconButton>
            </header>
            {tasks.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">Žiadne otvorené úlohy.</p>
            ) : (
              <ul className="divide-y divide-line">
                {tasks.map((t) => {
                  const overdue = !t.done && isBefore(t.start.toDate(), startOfDay(new Date()));
                  return (
                    <li key={t.id} className="flex items-start gap-3 px-4 py-2.5">
                      <button className="mt-0.5" onClick={() => toggle(t)} aria-label="Splnené">
                        {t.done ? <CheckCircle2 className="size-5 text-emerald-500" /> : <Circle className="size-5 text-subtle" />}
                      </button>
                      <button className="min-w-0 flex-1 text-left" onClick={() => openEvent(t)}>
                        <span className={cx('block text-sm', t.done && 'text-muted line-through')}>{t.title}</span>
                        <span className={cx('text-xs', overdue ? 'font-semibold text-red-600 dark:text-red-400' : 'text-muted')}>
                          {fmtDay(t.start)}
                          {t.repairNumber ? ` · ${t.repairNumber}` : ''}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </aside>
      </div>
      <EventDialog open={!!dialog} init={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

// ------------------------------------------------------------------ spoločné prvky

function EventChip({ e, onOpen, compact }: { e: CalendarEvent; onOpen: (e: CalendarEvent) => void; compact?: boolean }) {
  const t = eventType(e.type);
  return (
    <button
      onClick={(ev) => {
        ev.stopPropagation();
        onOpen(e);
      }}
      className={cx('block w-full truncate rounded-md border-l-[3px] px-1.5 py-0.5 text-left text-xs font-medium', block(t.tone), e.done && 'line-through opacity-60')}
      title={e.title}
    >
      {!e.allDay && !compact && <span className="tabular opacity-75">{fmtTime(e.start)} </span>}
      {e.title}
    </button>
  );
}

function DueChipRepair({ r }: { r: Repair }) {
  return (
    <Link
      to={`/zakazky/${r.id}`}
      onClick={(e) => e.stopPropagation()}
      className="flex items-center gap-1 truncate rounded-md border border-dashed border-orange-400 bg-surface px-1.5 py-0.5 text-xs font-medium text-orange-700 hover:bg-orange-50 dark:text-orange-300 dark:hover:bg-orange-500/10"
      title={`Termín zákazky ${r.number} – ${r.device.brand} ${r.device.model}`}
    >
      <Wrench className="size-3 shrink-0" />
      <span className="truncate">
        {r.number} {r.device.model}
      </span>
    </Link>
  );
}

const sameDay = (ts: Timestamp | null | undefined, d: Date) => {
  const x = toDate(ts);
  return !!x && isSameDay(x, d);
};

// ------------------------------------------------------------------ pásik dní (mobil – zobrazenie Deň)

function WeekStrip({
  cursor,
  events,
  dueRepairs,
  onPick,
  onSwipe,
}: {
  cursor: Date;
  events: CalendarEvent[];
  dueRepairs: Repair[];
  onPick: (d: Date) => void;
  onSwipe: (dir: 1 | -1) => void;
}) {
  const from = startOfWeek(cursor, WEEK);
  const touch = useRef<number | null>(null);
  return (
    <div
      className="grid grid-cols-7 gap-1 rounded-2xl border border-line bg-surface p-1.5 shadow-xs"
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current === null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (Math.abs(dx) > 50) onSwipe(dx < 0 ? 1 : -1);
      }}
    >
      {Array.from({ length: 7 }, (_, i) => addDays(from, i)).map((d) => {
        const selected = isSameDay(d, cursor);
        const types = [...new Set(events.filter((e) => sameDay(e.start, d)).map((e) => eventType(e.type).tone))].slice(0, 3);
        const due = dueRepairs.some((r) => sameDay(r.dueAt, d));
        return (
          <button
            key={d.toISOString()}
            onClick={() => onPick(d)}
            className={cx(
              'flex flex-col items-center gap-0.5 rounded-xl py-1.5 transition-colors',
              selected ? 'bg-primary text-primary-fg shadow-sm' : isToday(d) ? 'bg-primary-soft text-primary' : 'hover:bg-surface-2',
            )}
          >
            <span className={cx('text-[11px] font-medium uppercase', selected ? 'opacity-90' : 'text-muted', isWeekend(d) && !selected && 'text-subtle')}>{format(d, 'EEEEEE', { locale: sk })}</span>
            <span className="text-base font-bold tabular">{format(d, 'd')}</span>
            <span className="flex h-1.5 gap-0.5">
              {types.map((tone) => (
                <span key={tone} className={cx('size-1.5 rounded-full', selected ? 'bg-primary-fg' : toneDot[tone])} />
              ))}
              {due && <span className={cx('size-1.5 rounded-full', selected ? 'bg-primary-fg' : 'bg-orange-500')} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ deň / týždeň s hodinami

function layoutColumns(list: CalendarEvent[]) {
  const sorted = [...list].sort((a, b) => a.start.toMillis() - b.start.toMillis() || b.end.toMillis() - a.end.toMillis());
  const out = new Map<string, { col: number; cols: number }>();
  let cluster: CalendarEvent[] = [];
  let clusterEnd = 0;
  const columnsEnd: number[] = [];
  const flush = () => {
    const cols = columnsEnd.length || 1;
    for (const e of cluster) out.set(e.id, { ...out.get(e.id)!, cols });
    cluster = [];
    columnsEnd.length = 0;
  };
  for (const e of sorted) {
    const s = e.start.toMillis();
    if (cluster.length && s >= clusterEnd) flush();
    let c = columnsEnd.findIndex((end) => end <= s);
    if (c === -1) {
      c = columnsEnd.length;
      columnsEnd.push(0);
    }
    columnsEnd[c] = e.end.toMillis();
    out.set(e.id, { col: c, cols: 1 });
    cluster.push(e);
    clusterEnd = Math.max(clusterEnd, e.end.toMillis());
  }
  flush();
  return out;
}

interface DragState {
  id: string;
  mode: 'move' | 'resize';
  x: number;
  y: number;
  colWidth: number;
  dMin: number;
  dDay: number;
  moved: boolean;
}

function TimeGrid({
  days,
  events,
  dueRepairs,
  startHour,
  endHour,
  onOpen,
  onNew,
  onToggle,
  onDayClick,
}: {
  days: Date[];
  events: CalendarEvent[];
  dueRepairs: Repair[];
  startHour: number;
  endHour: number;
  onOpen: (e: CalendarEvent) => void;
  onNew: (d: Date, allDay?: boolean) => void;
  onToggle: (e: CalendarEvent) => void;
  onDayClick?: (d: Date) => void;
}) {
  const now = useNow();
  const { run, toast } = useFeedback();
  const gridRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const single = days.length === 1;
  const visible = events.filter((e) => days.some((d) => sameDay(e.start, d)));
  const timed = visible.filter((e) => !e.allDay);
  const minH = Math.min(startHour, ...timed.map((e) => e.start.toDate().getHours()));
  const maxH = Math.max(endHour, ...timed.map((e) => Math.ceil((e.end.toDate().getHours() * 60 + e.end.toDate().getMinutes()) / 60)));
  const hours = Array.from({ length: Math.max(1, maxH - minH) }, (_, i) => minH + i);
  const cols = `52px repeat(${days.length}, minmax(0, 1fr))`;

  const startDrag = (e: ReactPointerEvent, ev: CalendarEvent, mode: DragState['mode']) => {
    // Na dotykových displejoch ťahanie koliduje s posúvaním stránky – tam udalosť otvoríme ťuknutím.
    if (e.pointerType === 'touch' || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const width = gridRef.current ? (gridRef.current.clientWidth - 52) / days.length : 0;
    setDrag({ id: ev.id, mode, x: e.clientX, y: e.clientY, colWidth: width, dMin: 0, dDay: 0, moved: false });
  };
  const onMove = (e: ReactPointerEvent, ev: CalendarEvent, dayIndex: number) => {
    if (!drag || drag.id !== ev.id) return;
    const dy = e.clientY - drag.y;
    const dx = e.clientX - drag.x;
    const dMin = Math.round(((dy / HOUR_PX) * 60) / SNAP_MIN) * SNAP_MIN;
    const dDay = drag.mode === 'move' && drag.colWidth ? Math.max(-dayIndex, Math.min(days.length - 1 - dayIndex, Math.round(dx / drag.colWidth))) : 0;
    setDrag({ ...drag, dMin, dDay, moved: drag.moved || Math.abs(dy) > 4 || Math.abs(dx) > 4 });
  };
  const endDrag = (ev: CalendarEvent) => {
    if (!drag || drag.id !== ev.id) return;
    setDrag(null);
    if (!drag.moved) return onOpen(ev);
    const { start, end } = draggedTimes(ev, drag);
    if (start.getTime() === ev.start.toMillis() && end.getTime() === ev.end.toMillis()) return;
    run(() => moveEvent(ev.id, start, end)).then((ok) => ok !== undefined && toast(`${ev.title}: ${format(start, 'EEEEEE d. M.', { locale: sk })} ${fmtTime(start)}–${fmtTime(end)}`));
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
      <div className="overflow-x-auto">
        <div style={{ minWidth: single ? 0 : 700 }}>
          {!single && (
            <div className="grid border-b border-line" style={{ gridTemplateColumns: cols }}>
              <div />
              {days.map((d) => (
                <button key={d.toISOString()} onClick={() => onDayClick?.(d)} className={cx('border-l border-line px-2 py-2 text-center hover:bg-surface-2', isWeekend(d) && 'bg-surface-2/50')}>
                  <div className={cx('text-[11px] font-semibold uppercase', isToday(d) ? 'text-primary' : 'text-muted')}>{format(d, 'EEEEEE', { locale: sk })}</div>
                  <div className={cx('mx-auto mt-0.5 flex size-8 items-center justify-center rounded-full text-[15px] font-bold tabular', isToday(d) && 'bg-primary text-primary-fg')}>
                    {format(d, 'd')}
                  </div>
                </button>
              ))}
            </div>
          )}
          {/* Celodenné položky, úlohy a termíny zákaziek */}
          <div className="grid border-b border-line" style={{ gridTemplateColumns: cols }}>
            <div className="px-1.5 py-2 text-right text-[10px] leading-tight font-medium text-subtle">celý deň</div>
            {days.map((d) => {
              const items = visible.filter((e) => e.allDay && sameDay(e.start, d));
              const due = dueRepairs.filter((r) => sameDay(r.dueAt, d));
              return (
                <div key={d.toISOString()} className={cx('min-h-10 space-y-1 border-l border-line p-1', isWeekend(d) && !single && 'bg-surface-2/50')} onClick={() => onNew(d, true)}>
                  {items.map((e) =>
                    e.type === 'uloha' ? (
                      <div key={e.id} className={cx('flex items-center gap-1 rounded-md border-l-[3px] px-1 py-0.5 text-xs font-medium', block('violet'), e.done && 'opacity-60')}>
                        <button
                          onClick={(ev) => {
                            ev.stopPropagation();
                            onToggle(e);
                          }}
                          aria-label="Splnené"
                        >
                          {e.done ? <CheckCircle2 className="size-3.5 text-emerald-600" /> : <Circle className="size-3.5 opacity-60" />}
                        </button>
                        <button
                          className={cx('min-w-0 flex-1 truncate text-left', e.done && 'line-through')}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            onOpen(e);
                          }}
                        >
                          {e.title}
                        </button>
                      </div>
                    ) : (
                      <EventChip key={e.id} e={e} onOpen={onOpen} compact />
                    ),
                  )}
                  {due.map((r) => (
                    <DueChipRepair key={r.id} r={r} />
                  ))}
                </div>
              );
            })}
          </div>
          <div ref={gridRef} className="relative grid" style={{ gridTemplateColumns: cols }}>
            <div>
              {hours.map((h) => (
                <div key={h} className="relative text-right text-[11px] font-medium text-subtle tabular" style={{ height: HOUR_PX }}>
                  {h !== hours[0] && <span className="absolute -top-2 right-2">{h}:00</span>}
                </div>
              ))}
            </div>
            {days.map((d, dayIndex) => {
              const dayEvents = timed.filter((e) => sameDay(e.start, d));
              const lanes = layoutColumns(dayEvents);
              return (
                <div key={d.toISOString()} className={cx('relative border-l border-line', isWeekend(d) && !single && 'bg-surface-2/50', isToday(d) && !single && 'bg-primary-soft/30')}>
                  {hours.map((h) => (
                    <div key={h} className="relative border-t border-line/70 first:border-t-0" style={{ height: HOUR_PX }}>
                      <span className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-line/50" />
                      <button className="block h-1/2 w-full hover:bg-primary-soft/60" onClick={() => onNew(setHours(startOfDay(d), h))} aria-label={`Nová udalosť ${h}:00`} />
                      <button className="block h-1/2 w-full hover:bg-primary-soft/60" onClick={() => onNew(addMinutes(setHours(startOfDay(d), h), 30))} aria-label={`Nová udalosť ${h}:30`} />
                    </div>
                  ))}
                  {dayEvents.map((e) => {
                    const active = drag?.id === e.id ? drag : null;
                    const { start, end } = active ? draggedTimes(e, active) : { start: e.start.toDate(), end: e.end.toDate() };
                    const shiftDays = active ? active.dDay : 0;
                    const top = ((start.getHours() - minH) * 60 + start.getMinutes()) * (HOUR_PX / 60);
                    const height = Math.max(24, differenceInMinutes(end, start) * (HOUR_PX / 60) - 2);
                    const lane = active ? { col: 0, cols: 1 } : (lanes.get(e.id) ?? { col: 0, cols: 1 });
                    const t = eventType(e.type);
                    return (
                      <div
                        key={e.id}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(k) => k.key === 'Enter' && onOpen(e)}
                        onPointerDown={(p) => startDrag(p, e, 'move')}
                        onPointerMove={(p) => onMove(p, e, dayIndex)}
                        onPointerUp={() => endDrag(e)}
                        onPointerCancel={() => setDrag(null)}
                        onClick={(c) => {
                          // Myš rieši klik v endDrag; ťuknutie prstom otvorí udalosť tu.
                          if ((c.nativeEvent as PointerEvent).pointerType === 'mouse') return;
                          onOpen(e);
                        }}
                        className={cx(
                          'group absolute cursor-pointer overflow-hidden rounded-lg border-l-[3px] px-2 py-1 text-left text-xs shadow-xs select-none',
                          block(t.tone),
                          e.done && 'opacity-60',
                          active ? 'z-20 cursor-grabbing shadow-lg ring-2 ring-primary/50' : 'hover:shadow-md sm:cursor-grab',
                        )}
                        style={{
                          top,
                          height,
                          left: `calc(${(lane.col / lane.cols) * 100}% + 2px)`,
                          width: `calc(${100 / lane.cols}% - 4px)`,
                          transform: shiftDays ? `translateX(${shiftDays * (active?.colWidth ?? 0)}px)` : undefined,
                        }}
                      >
                        <div className="truncate font-semibold">{e.title}</div>
                        {height > 34 && (
                          <div className="truncate opacity-75 tabular">
                            {fmtTime(start)}–{fmtTime(end)}
                            {e.repairNumber ? ` · ${e.repairNumber}` : ''}
                          </div>
                        )}
                        <span
                          className="absolute inset-x-0 bottom-0 hidden h-2 cursor-ns-resize items-center justify-center sm:flex sm:opacity-0 sm:group-hover:opacity-100"
                          onPointerDown={(p) => startDrag(p, e, 'resize')}
                        >
                          <GripHorizontal className="size-3 opacity-60" />
                        </span>
                      </div>
                    );
                  })}
                  {isSameDay(d, now) && now.getHours() >= minH && now.getHours() < maxH && (
                    <div className="pointer-events-none absolute right-0 left-0 z-10 border-t-2 border-red-500" style={{ top: ((now.getHours() - minH) * 60 + now.getMinutes()) * (HOUR_PX / 60) }}>
                      <span className="absolute -top-[5px] -left-[5px] size-2 rounded-full bg-red-500" />
                      {single && <span className="absolute -top-2.5 right-1 rounded bg-red-500 px-1 text-[10px] font-semibold text-white tabular">{fmtTime(now)}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {!single && <p className="hidden border-t border-line px-3 py-1.5 text-[11px] text-subtle sm:block">Tip: udalosť presuniete ťahaním myšou, dĺžku zmeníte ťahaním za spodný okraj. Kliknutím do prázdneho miesta pridáte novú.</p>}
    </div>
  );
}

function draggedTimes(e: CalendarEvent, d: Pick<DragState, 'mode' | 'dMin' | 'dDay'>) {
  const s = e.start.toDate();
  const en = e.end.toDate();
  if (d.mode === 'resize') return { start: s, end: new Date(Math.max(s.getTime() + SNAP_MIN * 60000, en.getTime() + d.dMin * 60000)) };
  return { start: addDays(addMinutes(s, d.dMin), d.dDay), end: addDays(addMinutes(en, d.dMin), d.dDay) };
}

// ------------------------------------------------------------------ mesiac

function MonthView({
  cursor,
  from,
  events,
  dueRepairs,
  onOpen,
  onDay,
  onNew,
}: {
  cursor: Date;
  from: Date;
  events: CalendarEvent[];
  dueRepairs: Repair[];
  onOpen: (e: CalendarEvent) => void;
  onDay: (d: Date) => void;
  onNew: (d: Date) => void;
}) {
  const weeks = Math.round(differenceInCalendarDays(addDays(endOfWeek(endOfMonth(cursor), WEEK), 1), from) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(from, i));
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
      <div className="grid grid-cols-7 border-b border-line text-center text-[11px] font-semibold tracking-wide text-muted uppercase">
        {['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'].map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const ev = events.filter((e) => sameDay(e.start, d)).sort((a, b) => Number(!a.allDay) - Number(!b.allDay) || a.start.toMillis() - b.start.toMillis());
          const due = dueRepairs.filter((r) => sameDay(r.dueAt, d));
          const items: ReactNode[] = [...ev.map((e) => <EventChip key={e.id} e={e} onOpen={onOpen} />), ...due.map((r) => <DueChipRepair key={r.id} r={r} />)];
          const selected = isSameDay(d, cursor);
          return (
            <div
              key={d.toISOString()}
              onClick={() => onDay(d)}
              onDoubleClick={() => onNew(d)}
              className={cx(
                'group min-h-16 cursor-pointer space-y-1 border-r border-b border-line p-1 transition-colors hover:bg-surface-2/70 sm:min-h-28 [&:nth-child(7n)]:border-r-0',
                !isSameMonth(d, cursor) && 'bg-surface-2/40',
                selected && 'bg-primary-soft/50',
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cx(
                    'flex size-7 items-center justify-center rounded-full text-xs font-semibold tabular',
                    isToday(d) ? 'bg-primary text-primary-fg' : selected ? 'ring-2 ring-primary' : !isSameMonth(d, cursor) && 'text-subtle',
                  )}
                >
                  {format(d, 'd')}
                </span>
                {items.length > 0 && <span className="text-[10px] font-medium text-subtle sm:hidden">{items.length}</span>}
              </div>
              <div className="hidden space-y-1 sm:block">
                {items.slice(0, 3)}
                {items.length > 3 && <div className="px-1 text-[11px] font-medium text-muted">+{items.length - 3} ďalšie</div>}
              </div>
              {items.length > 0 && (
                <div className="flex flex-wrap justify-center gap-0.5 sm:hidden">
                  {[...new Set(ev.map((e) => eventType(e.type).tone))].slice(0, 3).map((tone) => (
                    <span key={tone} className={cx('size-1.5 rounded-full', toneDot[tone])} />
                  ))}
                  {due.length > 0 && <span className="size-1.5 rounded-full bg-orange-500" />}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MiniMonth({ cursor, events, onPick }: { cursor: Date; events: CalendarEvent[]; onPick: (d: Date) => void }) {
  const [month, setMonth] = useState(() => startOfMonth(cursor));
  useEffect(() => setMonth(startOfMonth(cursor)), [cursor]);
  const from = startOfWeek(month, WEEK);
  const days = Array.from({ length: 42 }, (_, i) => addDays(from, i));
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="pl-1 text-sm font-semibold first-letter:uppercase">{format(month, 'LLLL yyyy', { locale: sk })}</span>
        <div className="flex">
          <IconButton label="Predchádzajúci mesiac" size="sm" onClick={() => setMonth((m) => addMonths(m, -1))}>
            <ChevronLeft className="size-4" />
          </IconButton>
          <IconButton label="Nasledujúci mesiac" size="sm" onClick={() => setMonth((m) => addMonths(m, 1))}>
            <ChevronRight className="size-4" />
          </IconButton>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] font-semibold text-subtle uppercase">
        {['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'].map((d) => (
          <span key={d} className="py-1">
            {d}
          </span>
        ))}
        {days.map((d) => {
          const has = events.some((e) => sameDay(e.start, d));
          return (
            <button
              key={d.toISOString()}
              onClick={() => onPick(d)}
              className={cx(
                'relative mx-auto my-0.5 flex size-8 items-center justify-center rounded-full text-xs font-medium tabular normal-case',
                isSameDay(d, cursor) ? 'bg-primary text-primary-fg' : isToday(d) ? 'text-primary ring-1 ring-primary' : !isSameMonth(d, month) ? 'text-subtle' : 'text-fg hover:bg-surface-2',
              )}
            >
              {format(d, 'd')}
              {has && !isSameDay(d, cursor) && <span className="absolute bottom-0.5 size-1 rounded-full bg-primary" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ zoznam

function DayAgenda({
  day,
  events,
  dueRepairs,
  onOpen,
  onToggle,
  showEmpty,
}: {
  day: Date;
  events: CalendarEvent[];
  dueRepairs: Repair[];
  onOpen: (e: CalendarEvent) => void;
  onToggle: (e: CalendarEvent) => void;
  showEmpty?: boolean;
}) {
  const ev = events.filter((e) => sameDay(e.start, day)).sort((a, b) => Number(!a.allDay) - Number(!b.allDay) || a.start.toMillis() - b.start.toMillis());
  const due = dueRepairs.filter((r) => sameDay(r.dueAt, day));
  if (!ev.length && !due.length && !showEmpty) return null;
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
      <header className={cx('flex items-baseline gap-2 border-b border-line px-4 py-2.5', isToday(day) && 'bg-primary-soft/60')}>
        <span className={cx('text-sm font-bold first-letter:uppercase', isToday(day) && 'text-primary')}>{isToday(day) ? 'Dnes' : format(day, 'EEEE', { locale: sk })}</span>
        <span className="text-sm text-muted">{format(day, 'd. MMMM', { locale: sk })}</span>
      </header>
      {ev.length === 0 && due.length === 0 && <p className="px-4 py-4 text-sm text-muted">Nič naplánované.</p>}
      <ul className="divide-y divide-line">
        {ev.map((e) => {
          const t = eventType(e.type);
          return (
            <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-12 shrink-0 text-right text-sm font-semibold tabular">{e.allDay ? <span className="text-xs font-medium text-muted">celý deň</span> : fmtTime(e.start)}</span>
              {e.type === 'uloha' ? (
                <button onClick={() => onToggle(e)} aria-label="Splnené">
                  {e.done ? <CheckCircle2 className="size-5 text-emerald-500" /> : <Circle className="size-5 text-subtle" />}
                </button>
              ) : (
                <span className={cx('h-9 w-1 shrink-0 rounded-full', toneDot[t.tone])} />
              )}
              <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(e)}>
                <span className={cx('block truncate text-sm font-medium', e.done && 'text-muted line-through')}>{e.title}</span>
                <span className="block truncate text-xs text-muted">
                  {e.allDay ? t.label : `do ${fmtTime(e.end)} · ${t.label}`}
                  {e.repairNumber ? ` · ${e.repairNumber}` : ''}
                </span>
              </button>
            </li>
          );
        })}
        {due.map((r) => (
          <li key={r.id}>
            <Link to={`/zakazky/${r.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
              <span className="w-12 shrink-0 text-right text-xs font-semibold text-orange-600 dark:text-orange-400">termín</span>
              <Wrench className="size-5 shrink-0 text-orange-500" />
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
    </section>
  );
}

function AgendaView({
  from,
  days,
  events,
  dueRepairs,
  onOpen,
  onToggle,
}: {
  from: Date;
  days: number;
  events: CalendarEvent[];
  dueRepairs: Repair[];
  onOpen: (e: CalendarEvent) => void;
  onToggle: (e: CalendarEvent) => void;
}) {
  const list = Array.from({ length: days }, (_, i) => addDays(from, i)).filter(
    (d) => isToday(d) || events.some((e) => sameDay(e.start, d)) || dueRepairs.some((r) => sameDay(r.dueAt, d)),
  );
  if (!list.length)
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line px-6 py-12 text-center">
        <CalendarDays className="size-8 text-subtle" />
        <p className="font-semibold">V tomto období nič nie je naplánované</p>
      </div>
    );
  return (
    <div className="space-y-3">
      {list.map((d) => (
        <DayAgenda key={d.toISOString()} day={d} events={events} dueRepairs={dueRepairs} onOpen={onOpen} onToggle={onToggle} showEmpty={isToday(d)} />
      ))}
    </div>
  );
}
