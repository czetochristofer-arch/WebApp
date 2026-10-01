import { addDays, endOfDay, setHours, startOfDay } from 'date-fns';
import { Timestamp } from 'firebase/firestore';
import { BRANDS, COMMON_PROBLEMS, DEVICE_TYPES, PRIORITIES } from '@/lib/constants';
import { parseNum, toDate, toDateInput } from '@/lib/format';
import type { RepairInput } from '@/lib/db';
import type { Priority } from '@/lib/types';
import { Card, Input, Segmented, Textarea, cx } from '@/components/ui';
import { CustomerPicker, ItemsEditor } from '@/components/domain';
import { Cpu, Euro, NotebookPen, UserRound, Wrench } from 'lucide-react';
import type { ReactNode } from 'react';

export type RepairDraft = RepairInput;

export function emptyRepair(warrantyMonths: number): RepairDraft {
  return {
    status: 'prijate',
    priority: 'normalna',
    customerId: null,
    customer: { name: '', phone: '', email: '' },
    device: { type: 'mobil', brand: '', model: '', imei: '', color: '', passcode: '', accessories: '', condition: '' },
    problem: '',
    diagnosis: '',
    items: [],
    estimate: null,
    deposit: 0,
    paid: false,
    paymentMethod: null,
    paidAt: null,
    warrantyMonths,
    dueAt: Timestamp.fromDate(endOfDay(addDays(new Date(), 2))),
    notes: '',
    internalNotes: '',
    photos: [],
  };
}

type Setter = <K extends keyof RepairDraft>(key: K, value: RepairDraft[K]) => void;

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Card title={title} icon={icon}>
      {children}
    </Card>
  );
}

export function RepairFormSections({ draft, set, compact }: { draft: RepairDraft; set: Setter; compact?: boolean }) {
  const dev = draft.device;
  const setDev = (patch: Partial<RepairDraft['device']>) => set('device', { ...dev, ...patch });
  const dueDate = toDate(draft.dueAt);
  const quickDue = [
    { label: 'Dnes', d: new Date() },
    { label: 'Zajtra', d: addDays(new Date(), 1) },
    { label: '+2 dni', d: addDays(new Date(), 2) },
    { label: '+1 týždeň', d: addDays(new Date(), 7) },
  ];

  return (
    <div className="space-y-4">
      <Section title="Zákazník" icon={<UserRound className="size-4" />}>
        <CustomerPicker value={draft.customer} onChange={(c) => set('customer', c)} />
      </Section>

      <Section title="Zariadenie" icon={<Cpu className="size-4" />}>
        <div className="space-y-3">
          <Segmented value={dev.type} onChange={(v) => setDev({ type: v })} options={DEVICE_TYPES} size="sm" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Značka" list="cs-brands" placeholder="napr. Apple" value={dev.brand} onChange={(e) => setDev({ brand: e.target.value })} />
            <Input label="Model" placeholder="napr. iPhone 13 Pro" value={dev.model} onChange={(e) => setDev({ model: e.target.value })} />
            <Input label="IMEI / sériové číslo" value={dev.imei ?? ''} onChange={(e) => setDev({ imei: e.target.value })} inputMode="numeric" />
            <Input label="Kód / heslo na odomknutie" value={dev.passcode ?? ''} onChange={(e) => setDev({ passcode: e.target.value })} hint="Neukazuje sa na vytlačenom protokole" />
            {!compact && (
              <>
                <Input label="Farba" value={dev.color ?? ''} onChange={(e) => setDev({ color: e.target.value })} />
                <Input label="Príslušenstvo" placeholder="nabíjačka, obal, SIM…" value={dev.accessories ?? ''} onChange={(e) => setDev({ accessories: e.target.value })} />
              </>
            )}
          </div>
          <Input label="Stav pri prevzatí" placeholder="škrabance, prasknutý rám…" value={dev.condition ?? ''} onChange={(e) => setDev({ condition: e.target.value })} />
          <datalist id="cs-brands">
            {BRANDS.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </div>
      </Section>

      <Section title="Porucha a oprava" icon={<Wrench className="size-4" />}>
        <div className="space-y-3">
          <Textarea label="Popis poruchy (od zákazníka)" value={draft.problem} onChange={(e) => set('problem', e.target.value)} rows={2} placeholder="Čo nefunguje?" />
          <div className="flex flex-wrap gap-1.5">
            {COMMON_PROBLEMS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => set('problem', draft.problem ? (draft.problem.includes(p) ? draft.problem : `${draft.problem}, ${p.toLowerCase()}`) : p)}
                className="rounded-full border border-line px-2.5 py-1 text-xs font-medium text-muted hover:border-primary hover:text-primary"
              >
                + {p}
              </button>
            ))}
          </div>
          <Textarea label="Diagnostika / zistenie servisu" value={draft.diagnosis ?? ''} onChange={(e) => set('diagnosis', e.target.value)} rows={2} />
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-muted">Práca a diely</p>
            <ItemsEditor items={draft.items} onChange={(items) => set('items', items)} />
          </div>
        </div>
      </Section>

      <Section title="Cena, termín a priorita" icon={<Euro className="size-4" />}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            label="Predbežná cena"
            inputMode="decimal"
            suffix="€"
            value={draft.estimate ?? ''}
            onChange={(e) => set('estimate', e.target.value === '' ? null : parseNum(e.target.value))}
            hint={draft.items.length ? 'Konečná suma sa počíta z položiek' : 'Ak ešte nie sú položky'}
          />
          <Input label="Záloha" inputMode="decimal" suffix="€" value={draft.deposit || ''} onChange={(e) => set('deposit', parseNum(e.target.value))} />
          <Input
            label="Záruka"
            inputMode="numeric"
            suffix="mes."
            value={draft.warrantyMonths ?? ''}
            onChange={(e) => set('warrantyMonths', e.target.value === '' ? null : Math.round(parseNum(e.target.value)))}
          />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <Input
              label="Termín dokončenia"
              type="date"
              value={toDateInput(draft.dueAt)}
              onChange={(e) => set('dueAt', e.target.value ? Timestamp.fromDate(endOfDay(new Date(e.target.value + 'T12:00'))) : null)}
            />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {quickDue.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => set('dueAt', Timestamp.fromDate(endOfDay(q.d)))}
                  className={cx(
                    'rounded-full border px-2.5 py-0.5 text-xs font-medium',
                    dueDate && startOfDay(dueDate).getTime() === startOfDay(q.d).getTime() ? 'border-primary bg-primary-soft text-primary' : 'border-line text-muted',
                  )}
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-muted">Priorita</span>
            <Segmented value={draft.priority} onChange={(v: Priority) => set('priority', v)} options={PRIORITIES} size="sm" />
          </div>
        </div>
      </Section>

      <Section title="Poznámky" icon={<NotebookPen className="size-4" />}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Textarea label="Poznámka pre zákazníka (tlačí sa)" value={draft.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
          <Textarea label="Interná poznámka" value={draft.internalNotes ?? ''} onChange={(e) => set('internalNotes', e.target.value)} />
        </div>
      </Section>
    </div>
  );
}

/** Pomocník pre "zajtra o 10:00" a pod. v rýchlych voľbách kalendára. */
export const atHour = (d: Date, h: number) => setHours(startOfDay(d), h);
