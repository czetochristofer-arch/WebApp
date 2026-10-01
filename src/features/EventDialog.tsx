import { useEffect, useState } from 'react';
import { addDays, addMinutes, differenceInMinutes, endOfDay, format, startOfDay } from 'date-fns';
import { Timestamp } from 'firebase/firestore';
import { Trash2 } from 'lucide-react';
import { useData } from '@/features/data';
import { isRepairOpen } from '@/features/metrics';
import { Button, Input, Modal, Segmented, Select, Textarea, Toggle, cx } from '@/components/ui';
import { useFeedback } from '@/components/feedback';
import { EVENT_TYPES } from '@/lib/constants';
import { deleteEvent, saveEvent, type EventInput } from '@/lib/db';
import type { CalendarEvent, EventType } from '@/lib/types';

export type EventDraftInit = Partial<Omit<CalendarEvent, 'start' | 'end'>> & { start?: Date; end?: Date };

const DURATIONS = [15, 30, 60, 90, 120, 180];

export function EventDialog({ open, onClose, init }: { open: boolean; onClose: () => void; init: EventDraftInit | null }) {
  const { repairs } = useData();
  const { run, confirm } = useFeedback();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<EventType>('termin');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [duration, setDuration] = useState(60);
  const [allDay, setAllDay] = useState(false);
  const [repairId, setRepairId] = useState('');
  const [notes, setNotes] = useState('');
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !init) return;
    const start = init.start ?? new Date();
    const end = init.end ?? addMinutes(start, 60);
    setTitle(init.title ?? '');
    setType(init.type ?? 'termin');
    setDate(format(start, 'yyyy-MM-dd'));
    setTime(format(start, 'HH:mm'));
    setDuration(Math.max(15, differenceInMinutes(end, start)));
    setAllDay(init.allDay ?? init.type === 'uloha');
    setRepairId(init.repairId ?? '');
    setNotes(init.notes ?? '');
    setDone(init.done ?? false);
  }, [open, init]);

  const openRepairs = repairs.filter((r) => isRepairOpen(r) || r.id === repairId);

  const save = async () => {
    if (!title.trim()) return;
    const day = new Date(`${date}T00:00`);
    const start = allDay ? startOfDay(day) : new Date(`${date}T${time || '09:00'}`);
    const end = allDay ? endOfDay(day) : addMinutes(start, duration);
    const repair = repairs.find((r) => r.id === repairId);
    const input: EventInput = {
      title: title.trim(),
      type,
      start: Timestamp.fromDate(start),
      end: Timestamp.fromDate(end),
      allDay,
      done,
      repairId: repair?.id ?? null,
      repairNumber: repair?.number ?? null,
      orderId: init?.orderId ?? null,
      orderNumber: init?.orderNumber ?? null,
      notes,
    };
    setSaving(true);
    const ok = await run(() => saveEvent(input, init?.id), init?.id ? 'Uložené' : type === 'uloha' ? 'Úloha pridaná' : 'Pridané do kalendára');
    setSaving(false);
    if (ok !== undefined) onClose();
  };

  const remove = async () => {
    if (!init?.id) return;
    if (await confirm({ title: 'Vymazať?', message: `„${title}“ sa odstráni z kalendára.`, confirmLabel: 'Vymazať', danger: true })) {
      await run(() => deleteEvent(init.id!), 'Vymazané');
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={init?.id ? 'Upraviť' : type === 'uloha' ? 'Nová úloha' : 'Nová udalosť'}
      footer={
        <>
          {init?.id && (
            <Button variant="ghost" className="mr-auto text-red-600" icon={<Trash2 className="size-4" />} onClick={remove}>
              Vymazať
            </Button>
          )}
          <Button onClick={onClose}>Zrušiť</Button>
          <Button variant="primary" onClick={save} loading={saving} disabled={!title.trim()}>
            Uložiť
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          autoFocus
          label="Názov"
          placeholder={type === 'uloha' ? 'napr. Objednať displeje u dodávateľa' : 'napr. Oprava iPhone 13 – p. Novák'}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
        <Segmented value={type} onChange={(v) => { setType(v); if (v === 'uloha') setAllDay(true); }} options={EVENT_TYPES.map((t) => ({ id: t.id, label: t.label }))} size="sm" />
        <div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Dátum" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            {!allDay && <Input label="Čas" type="time" value={time} onChange={(e) => setTime(e.target.value)} step={300} />}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {[
              { label: 'Dnes', d: new Date() },
              { label: 'Zajtra', d: addDays(new Date(), 1) },
              { label: 'Pozajtra', d: addDays(new Date(), 2) },
              { label: 'O týždeň', d: addDays(new Date(), 7) },
            ].map((q) => {
              const v = format(q.d, 'yyyy-MM-dd');
              return (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => setDate(v)}
                  className={cx('rounded-full border px-2.5 py-0.5 text-xs font-medium', date === v ? 'border-primary bg-primary-soft text-primary' : 'border-line text-muted hover:text-fg')}
                >
                  {q.label}
                </button>
              );
            })}
          </div>
        </div>
        {!allDay && (
          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-muted">Trvanie</span>
            <Segmented
              value={String(duration)}
              onChange={(v) => setDuration(Number(v))}
              options={[...new Set([...DURATIONS, duration])].sort((a, b) => a - b).map((m) => ({ id: String(m), label: m < 60 ? `${m} min` : `${m / 60} h` }))}
              size="sm"
            />
          </div>
        )}
        <Toggle checked={allDay} onChange={setAllDay} label={type === 'uloha' ? 'Bez konkrétneho času' : 'Celý deň'} />
        {type === 'uloha' && <Toggle checked={done} onChange={setDone} label="Splnené" />}
        <Select label="Súvisí so zákazkou" value={repairId} onChange={(e) => setRepairId(e.target.value)}>
          <option value="">— žiadna —</option>
          {openRepairs.map((r) => (
            <option key={r.id} value={r.id}>
              {r.number} · {r.device.brand} {r.device.model} · {r.customer.name}
            </option>
          ))}
        </Select>
        <Textarea label="Poznámka" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </div>
    </Modal>
  );
}
