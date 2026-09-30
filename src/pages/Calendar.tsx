import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { query, Timestamp, where } from 'firebase/firestore';
import {
  addDays,
  addMonths,
  addWeeks,
  differenceInMinutes,
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  setHours,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { sk } from 'date-fns/locale';
import { CheckCircle2, ChevronLeft, ChevronRight, Circle, ListTodo, Plus, Wrench } from 'lucide-react';
import { useData } from '@/features/data';
import { isRepairOpen } from '@/features/metrics';
import { EventDialog, type EventDraftInit } from '@/features/EventDialog';
import { Button, Card, IconButton, PageHeader, Segmented, cx, toneBg, toneBorder } from '@/components/ui';
import { useFeedback } from '@/components/feedback';
import { col, toggleEventDone } from '@/lib/db';
import { eventType } from '@/lib/constants';
import { fmtDay, fmtTime, toDate } from '@/lib/format';
import { useIsDesktop, useLiveQuery, useNow } from '@/lib/hooks';
import type { CalendarEvent, EventType, Repair } from '@/lib/types';

type View = 'agenda' | 'den' | 'tyzden' | 'mesiac';
const HOUR_PX = 56;

export function CalendarPage() {
  const isDesktop = useIsDesktop();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<View>(() => (isDesktop ? 'tyzden' : 'agenda'));
  const [cursor, setCursor] = useState(() => new Date());
  const [dialog, setDialog] = useState<EventDraftInit | null>(null);
  const { repairs, events: recentEvents, settings } = useData();
  const { run } = useFeedback();

  useEffect(() => {
    const nova = params.get('nova') as EventType | null;
    if (nova) {
      const start = nova === 'uloha' ? startOfDay(new Date()) : setHours(startOfDay(addDays(new Date(), 0)), Math.min(Math.max(new Date().getHours() + 1, settings.workdayStart), settings.workdayEnd - 1));
      setDialog({ type: nova, start, allDay: nova === 'uloha' });
      setParams({}, { replace: true });
    }
  }, [params, setParams, settings.workdayStart, settings.workdayEnd]);

  const range = useMemo(() => {
    if (view === 'mesiac') return { from: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }), to: addDays(endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }), 1) };
    if (view === 'tyzden') return { from: startOfWeek(cursor, { weekStartsOn: 1 }), to: addDays(startOfWeek(cursor, { weekStartsOn: 1 }), 7) };
    if (view === 'den') return { from: startOfDay(cursor), to: addDays(startOfDay(cursor), 1) };
    return { from: startOfDay(cursor), to: addDays(startOfDay(cursor), 21) };
  }, [view, cursor]);

  const live = useLiveQuery<CalendarEvent>(
    () => query(col.events(), where('start', '>=', Timestamp.fromDate(range.from)), where('start', '<', Timestamp.fromDate(range.to))),
    `cal-${range.from.getTime()}-${range.to.getTime()}`,
  );
  const events = live.data;
  const dueRepairs = useMemo(
    () => repairs.filter((r) => isRepairOpen(r) && r.dueAt && toDate(r.dueAt)! >= range.from && toDate(r.dueAt)! < range.to),
    [repairs, range],
  );

  const move = (dir: 1 | -1) => {
    if (view === 'mesiac') setCursor((c) => addMonths(c, dir));
    else if (view === 'tyzden') setCursor((c) => addWeeks(c, dir));
    else if (view === 'den') setCursor((c) => addDays(c, dir));
    else setCursor((c) => addDays(c, dir * 14));
  };

  const title =
    view === 'mesiac'
      ? format(cursor, 'LLLL yyyy', { locale: sk })
      : view === 'tyzden'
        ? `${format(range.from, 'd. M.')} – ${format(addDays(range.to, -1), 'd. M. yyyy')}`
        : view === 'den'
          ? format(cursor, 'EEEE d. MMMM', { locale: sk })
          : `Od ${format(range.from, 'd. M.')}`;

  const openEvent = (e: CalendarEvent) => setDialog({ ...e, start: e.start.toDate(), end: e.end.toDate() });
  const newAt = (d: Date, allDay = false) => setDialog({ type: 'termin', start: d, allDay });

  // Úlohy: otvorené (vrátane starších) + dnes splnené.
  const tasks = useMemo(
    () =>
      recentEvents
        .filter((e) => e.type === 'uloha' && (!e.done || isSameDay(toDate(e.updatedAt) ?? new Date(0), new Date())))
        .sort((a, b) => Number(a.done) - Number(b.done) || a.start.toMillis() - b.start.toMillis()),
    [recentEvents],
  );

  return (
    <div>
      <PageHeader
        title="Kalendár"
        subtitle="Harmonogram práce, termíny so zákazníkmi a úlohy"
        actions={
          <>
            <Button icon={<ListTodo className="size-4" />} onClick={() => setDialog({ type: 'uloha', start: startOfDay(new Date()), allDay: true })}>
              Úloha
            </Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => newAt(setHours(startOfDay(cursor), settings.workdayStart + 1))}>
              Udalosť
            </Button>
          </>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <IconButton label="Predchádzajúce" onClick={() => move(-1)}>
                <ChevronLeft className="size-5" />
              </IconButton>
              <Button size="sm" onClick={() => setCursor(new Date())}>
                Dnes
              </Button>
              <IconButton label="Nasledujúce" onClick={() => move(1)}>
                <ChevronRight className="size-5" />
              </IconButton>
            </div>
            <h2 className="text-lg font-semibold first-letter:uppercase">{title}</h2>
            <Segmented
              className="ml-auto"
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { id: 'agenda', label: 'Zoznam' },
                { id: 'den', label: 'Deň' },
                { id: 'tyzden', label: 'Týždeň' },
                { id: 'mesiac', label: 'Mesiac' },
              ]}
            />
          </div>

          {view === 'agenda' && <AgendaView from={range.from} days={21} events={events} dueRepairs={dueRepairs} onOpen={openEvent} onToggle={(e) => run(() => toggleEventDone(e))} />}
          {(view === 'tyzden' || view === 'den') && (
            <TimeGrid
              days={view === 'den' ? [startOfDay(cursor)] : Array.from({ length: 7 }, (_, i) => addDays(range.from, i))}
              events={events}
              dueRepairs={dueRepairs}
              startHour={settings.workdayStart}
              endHour={settings.workdayEnd}
              onOpen={openEvent}
              onNew={newAt}
              onDayClick={(d) => {
                setCursor(d);
                setView('den');
              }}
            />
          )}
          {view === 'mesiac' && (
            <MonthView
              cursor={cursor}
              from={range.from}
              events={events}
              dueRepairs={dueRepairs}
              onOpen={openEvent}
              onDay={(d) => {
                setCursor(d);
                setView(isDesktop ? 'tyzden' : 'den');
              }}
            />
          )}
        </div>

        <Card
          title="Úlohy"
          icon={<ListTodo className="size-4" />}
          bodyClass="p-0"
          className="h-fit"
          actions={
            <IconButton label="Pridať úlohu" size="sm" onClick={() => setDialog({ type: 'uloha', start: startOfDay(new Date()), allDay: true })}>
              <Plus className="size-4" />
            </IconButton>
          }
        >
          {tasks.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted">Žiadne otvorené úlohy.</p>
          ) : (
            <ul className="divide-y divide-line">
              {tasks.map((t) => {
                const overdue = !t.done && isBefore(t.start.toDate(), startOfDay(new Date()));
                return (
                  <li key={t.id} className="flex items-start gap-3 px-4 py-2.5">
                    <button className="mt-0.5" onClick={() => run(() => toggleEventDone(t))} aria-label="Splnené">
                      {t.done ? <CheckCircle2 className="size-5 text-emerald-500" /> : <Circle className="size-5 text-subtle" />}
                    </button>
                    <button className="min-w-0 flex-1 text-left" onClick={() => openEvent(t)}>
                      <span className={cx('block text-sm', t.done && 'text-muted line-through')}>{t.title}</span>
                      <span className={cx('text-xs', overdue ? 'font-semibold text-red-600' : 'text-muted')}>
                        {fmtDay(t.start)}
                        {t.repairNumber ? ` · ${t.repairNumber}` : ''}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
      <EventDialog open={!!dialog} init={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

function EventChip({ e, onOpen, compact }: { e: CalendarEvent; onOpen: (e: CalendarEvent) => void; compact?: boolean }) {
  const t = eventType(e.type);
  return (
    <button
      onClick={(ev) => {
        ev.stopPropagation();
        onOpen(e);
      }}
      className={cx('block w-full truncate rounded-md border-l-[3px] px-1.5 py-0.5 text-left text-xs font-medium', toneBg[t.tone], toneBorder[t.tone], e.done && 'line-through opacity-60')}
      title={e.title}
    >
      {!e.allDay && !compact && <span className="tabular opacity-80">{fmtTime(e.start)} </span>}
      {e.title}
    </button>
  );
}

function DueChipRepair({ r }: { r: Repair }) {
  return (
    <Link
      to={`/zakazky/${r.id}`}
      onClick={(e) => e.stopPropagation()}
      className="flex items-center gap-1 truncate rounded-md border border-dashed border-orange-400 px-1.5 py-0.5 text-xs font-medium text-orange-700 dark:text-orange-300"
      title={`Termín zákazky ${r.number}`}
    >
      <Wrench className="size-3 shrink-0" />
      <span className="truncate">
        {r.number} {r.device.model}
      </span>
    </Link>
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
  const list = Array.from({ length: days }, (_, i) => addDays(from, i))
    .map((d) => ({
      day: d,
      ev: events.filter((e) => isSameDay(e.start.toDate(), d)).sort((a, b) => Number(!a.allDay) - Number(!b.allDay) || a.start.toMillis() - b.start.toMillis()),
      due: dueRepairs.filter((r) => isSameDay(toDate(r.dueAt)!, d)),
    }))
    .filter((x) => x.ev.length || x.due.length || isSameDay(x.day, new Date()));
  return (
    <div className="space-y-3">
      {list.map(({ day, ev, due }) => (
        <div key={day.toISOString()} className="overflow-hidden rounded-2xl border border-line bg-surface">
          <div className={cx('border-b border-line px-4 py-2 text-sm font-semibold first-letter:uppercase', isSameDay(day, new Date()) && 'text-primary')}>
            {fmtDay(day)} <span className="font-normal text-muted">· {format(day, 'd. MMMM', { locale: sk })}</span>
          </div>
          {ev.length === 0 && due.length === 0 && <p className="px-4 py-3 text-sm text-muted">Nič naplánované.</p>}
          <ul className="divide-y divide-line">
            {ev.map((e) => {
              const t = eventType(e.type);
              return (
                <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                  {e.type === 'uloha' ? (
                    <button onClick={() => onToggle(e)} aria-label="Splnené">
                      {e.done ? <CheckCircle2 className="size-5 text-emerald-500" /> : <Circle className="size-5 text-subtle" />}
                    </button>
                  ) : (
                    <span className={cx('h-9 w-1 shrink-0 rounded-full', toneBorder[t.tone].replace('border-l-', 'bg-'))} />
                  )}
                  <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(e)}>
                    <span className={cx('block truncate text-sm font-medium', e.done && 'text-muted line-through')}>{e.title}</span>
                    <span className="text-xs text-muted">
                      {e.allDay ? 'celý deň' : `${fmtTime(e.start)} – ${fmtTime(e.end)}`} · {t.label}
                      {e.repairNumber ? ` · ${e.repairNumber}` : ''}
                    </span>
                  </button>
                </li>
              );
            })}
            {due.map((r) => (
              <li key={r.id} className="px-4 py-2.5">
                <Link to={`/zakazky/${r.id}`} className="flex items-center gap-3">
                  <Wrench className="size-4 text-orange-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      Termín: {r.number} · {r.device.brand} {r.device.model}
                    </span>
                    <span className="text-xs text-muted">{r.customer.name}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

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
    let col = columnsEnd.findIndex((end) => end <= s);
    if (col === -1) {
      col = columnsEnd.length;
      columnsEnd.push(0);
    }
    columnsEnd[col] = e.end.toMillis();
    out.set(e.id, { col, cols: 1 });
    cluster.push(e);
    clusterEnd = Math.max(clusterEnd, e.end.toMillis());
  }
  flush();
  return out;
}

function TimeGrid({
  days,
  events,
  dueRepairs,
  startHour,
  endHour,
  onOpen,
  onNew,
  onDayClick,
}: {
  days: Date[];
  events: CalendarEvent[];
  dueRepairs: Repair[];
  startHour: number;
  endHour: number;
  onOpen: (e: CalendarEvent) => void;
  onNew: (d: Date, allDay?: boolean) => void;
  onDayClick: (d: Date) => void;
}) {
  const now = useNow();
  const timed = events.filter((e) => !e.allDay);
  const minH = Math.min(startHour, ...timed.map((e) => e.start.toDate().getHours()));
  const maxH = Math.max(endHour, ...timed.map((e) => Math.ceil((e.end.toDate().getHours() * 60 + e.end.toDate().getMinutes()) / 60)));
  const hours = Array.from({ length: Math.max(1, maxH - minH) }, (_, i) => minH + i);
  const single = days.length === 1;

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="overflow-x-auto">
        <div style={{ minWidth: single ? 0 : 720 }}>
          <div className="grid border-b border-line" style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(0, 1fr))` }}>
            <div />
            {days.map((d) => (
              <button key={d.toISOString()} onClick={() => onDayClick(d)} className="border-l border-line px-2 py-2 text-center">
                <div className="text-xs text-muted uppercase">{format(d, 'EEEEEE', { locale: sk })}</div>
                <div className={cx('mx-auto mt-0.5 flex size-8 items-center justify-center rounded-full text-sm font-semibold', isSameDay(d, now) && 'bg-primary text-primary-fg')}>
                  {format(d, 'd')}
                </div>
              </button>
            ))}
          </div>
          {/* Celodenné a termíny zákaziek */}
          <div className="grid border-b border-line" style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(0, 1fr))` }}>
            <div className="px-1 py-1.5 text-right text-[10px] text-subtle">celý deň</div>
            {days.map((d) => (
              <div key={d.toISOString()} className="min-h-8 space-y-1 border-l border-line p-1" onClick={() => onNew(d, true)}>
                {events.filter((e) => e.allDay && isSameDay(e.start.toDate(), d)).map((e) => (
                  <EventChip key={e.id} e={e} onOpen={onOpen} compact />
                ))}
                {dueRepairs.filter((r) => isSameDay(toDate(r.dueAt)!, d)).map((r) => (
                  <DueChipRepair key={r.id} r={r} />
                ))}
              </div>
            ))}
          </div>
          <div className="relative grid" style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(0, 1fr))` }}>
            <div>
              {hours.map((h) => (
                <div key={h} className="relative text-right text-[11px] text-subtle" style={{ height: HOUR_PX }}>
                  <span className="absolute -top-2 right-2">{h}:00</span>
                </div>
              ))}
            </div>
            {days.map((d) => {
              const dayEvents = timed.filter((e) => isSameDay(e.start.toDate(), d));
              const cols = layoutColumns(dayEvents);
              return (
                <div key={d.toISOString()} className="relative border-l border-line">
                  {hours.map((h) => (
                    <div key={h} className="border-b border-line/60" style={{ height: HOUR_PX }}>
                      <button className="block h-1/2 w-full hover:bg-primary-soft/60" onClick={() => onNew(setHours(startOfDay(d), h))} aria-label={`Nová udalosť ${h}:00`} />
                      <button
                        className="block h-1/2 w-full hover:bg-primary-soft/60"
                        onClick={() => {
                          const t = setHours(startOfDay(d), h);
                          t.setMinutes(30);
                          onNew(t);
                        }}
                        aria-label={`Nová udalosť ${h}:30`}
                      />
                    </div>
                  ))}
                  {dayEvents.map((e) => {
                    const s = e.start.toDate();
                    const top = ((s.getHours() - minH) * 60 + s.getMinutes()) * (HOUR_PX / 60);
                    const height = Math.max(22, differenceInMinutes(e.end.toDate(), s) * (HOUR_PX / 60) - 2);
                    const pos = cols.get(e.id) ?? { col: 0, cols: 1 };
                    const t = eventType(e.type);
                    return (
                      <button
                        key={e.id}
                        onClick={() => onOpen(e)}
                        className={cx('absolute overflow-hidden rounded-lg border-l-[3px] px-1.5 py-1 text-left text-xs shadow-xs', toneBg[t.tone], toneBorder[t.tone], e.done && 'opacity-60')}
                        style={{ top, height, left: `calc(${(pos.col / pos.cols) * 100}% + 2px)`, width: `calc(${100 / pos.cols}% - 4px)` }}
                      >
                        <div className="truncate font-semibold">{e.title}</div>
                        {height > 36 && (
                          <div className="truncate opacity-80">
                            {fmtTime(e.start)}–{fmtTime(e.end)}
                            {e.repairNumber ? ` · ${e.repairNumber}` : ''}
                          </div>
                        )}
                      </button>
                    );
                  })}
                  {isSameDay(d, now) && now.getHours() >= minH && now.getHours() < maxH && (
                    <div className="pointer-events-none absolute right-0 left-0 z-10 border-t-2 border-red-500" style={{ top: ((now.getHours() - minH) * 60 + now.getMinutes()) * (HOUR_PX / 60) }}>
                      <span className="absolute -top-[5px] -left-[5px] size-2 rounded-full bg-red-500" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function MonthView({
  cursor,
  from,
  events,
  dueRepairs,
  onOpen,
  onDay,
}: {
  cursor: Date;
  from: Date;
  events: CalendarEvent[];
  dueRepairs: Repair[];
  onOpen: (e: CalendarEvent) => void;
  onDay: (d: Date) => void;
}) {
  const weeks = Math.ceil((differenceInMinutes(addDays(endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }), 1), from) / 60 / 24 + 0.1) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(from, i));
  const today = new Date();
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="grid grid-cols-7 border-b border-line text-center text-xs font-semibold text-muted">
        {['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'].map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const ev = events.filter((e) => isSameDay(e.start.toDate(), d));
          const due = dueRepairs.filter((r) => isSameDay(toDate(r.dueAt)!, d));
          const items: ReactNode[] = [
            ...ev.map((e) => <EventChip key={e.id} e={e} onOpen={onOpen} />),
            ...due.map((r) => <DueChipRepair key={r.id} r={r} />),
          ];
          return (
            <div
              key={d.toISOString()}
              onClick={() => onDay(d)}
              className={cx('min-h-24 cursor-pointer space-y-1 border-r border-b border-line p-1 hover:bg-surface-2/60 sm:min-h-28', !isSameMonth(d, cursor) && 'bg-surface-2/40')}
            >
              <div className={cx('flex size-6 items-center justify-center rounded-full text-xs font-semibold', isSameDay(d, today) ? 'bg-primary text-primary-fg' : !isSameMonth(d, cursor) && 'text-subtle')}>
                {format(d, 'd')}
              </div>
              <div className="hidden space-y-1 sm:block">
                {items.slice(0, 3)}
                {items.length > 3 && <div className="px-1 text-[11px] text-muted">+{items.length - 3} ďalšie</div>}
              </div>
              {items.length > 0 && <div className="mx-auto size-1.5 rounded-full bg-primary sm:hidden" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
