import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, Minus, X } from 'lucide-react';
import { Input, Segmented, cx } from '@/components/ui';
import { BRANDS, DEVICE_TYPES, PHONE_CHECKS, PHONE_GRADES, PHONE_TASK_PRESETS, STORAGE_PRESETS } from '@/lib/constants';
import { findPhonesByIdentifier, isValidImei, phoneName } from '@/lib/phones';
import { fmtDate, parseNum } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import { newId } from '@/lib/db';
import type { Phone, PhoneDevice, PhoneGrade, PhoneSeller, PhoneTask } from '@/lib/types';

export function SellerFields({ value, onChange }: { value: PhoneSeller; onChange: (v: PhoneSeller) => void }) {
  const set = (patch: Partial<PhoneSeller>) => onChange({ ...value, ...patch });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Input label="Meno a priezvisko *" value={value.name} onChange={(e) => set({ name: e.target.value })} autoComplete="off" />
      <Input label="Telefón *" type="tel" inputMode="tel" value={value.phone ?? ''} onChange={(e) => set({ phone: e.target.value })} autoComplete="off" />
      <Input label="Trvalé bydlisko *" wrapClass="sm:col-span-2" value={value.address ?? ''} onChange={(e) => set({ address: e.target.value })} placeholder="ulica a číslo, PSČ, obec" autoComplete="off" />
      <Input label="Dátum narodenia *" type="date" value={value.birthDate ?? ''} onChange={(e) => set({ birthDate: e.target.value })} />
      <Input label="Číslo dokladu totožnosti (OP)" value={value.idDocument ?? ''} onChange={(e) => set({ idDocument: e.target.value.toUpperCase() })} hint="Odporúčané – overenie totožnosti predávajúceho" autoComplete="off" />
      <Input label="E-mail" type="email" value={value.email ?? ''} onChange={(e) => set({ email: e.target.value })} autoComplete="off" />
    </div>
  );
}

/** Upozornenie, ak je IMEI neplatné alebo už je v evidencii (dvojitý výkup, kradnutý kus). */
function IdentifierCheck({ value, selfId }: { value?: string; selfId?: string }) {
  const dq = useDebounced(value ?? '', 500);
  const [dupes, setDupes] = useState<Phone[]>([]);
  useEffect(() => {
    let alive = true;
    if (!dq || dq.replace(/[^0-9a-z]/gi, '').length < 6) return setDupes([]);
    findPhonesByIdentifier(dq)
      .then((list) => alive && setDupes(list.filter((p) => p.id !== selfId)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [dq, selfId]);
  const digits = (value ?? '').replace(/\D/g, '');
  return (
    <>
      {digits.length >= 14 && !isValidImei(digits) && <p className="text-xs text-amber-700 dark:text-amber-300">IMEI nemá platný kontrolný súčet – skontrolujte ho (*#06#).</p>}
      {dupes.map((d) => (
        <p key={d.id} className="flex items-center gap-1 text-xs font-semibold text-red-600 dark:text-red-400">
          <AlertTriangle className="size-3.5" /> Toto IMEI už je v evidencii:{' '}
          <Link to={`/telefony/${d.id}`} className="underline">
            {d.number} {phoneName(d)}
          </Link>{' '}
          ({fmtDate(d.purchasedAt)})
        </p>
      ))}
    </>
  );
}

export function DeviceFields({ value, onChange, selfId }: { value: PhoneDevice; onChange: (v: PhoneDevice) => void; selfId?: string }) {
  const set = (patch: Partial<PhoneDevice>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-3">
      <Segmented value={value.type} onChange={(v) => set({ type: v })} options={DEVICE_TYPES} size="sm" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Značka *" list="cs-brands-phone" value={value.brand} onChange={(e) => set({ brand: e.target.value })} placeholder="napr. Apple" />
        <Input label="Model *" value={value.model} onChange={(e) => set({ model: e.target.value })} placeholder="napr. iPhone 13 Pro" />
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-[13px] font-medium text-muted">Kapacita</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {STORAGE_PRESETS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => set({ storage: value.storage === s ? '' : s })}
                className={cx('rounded-full border px-3 py-1 text-sm font-medium', value.storage === s ? 'border-primary bg-primary-soft text-primary' : 'border-line text-muted hover:text-fg')}
              >
                {s}
              </button>
            ))}
            <input
              value={STORAGE_PRESETS.includes(value.storage ?? '') ? '' : (value.storage ?? '')}
              onChange={(e) => set({ storage: e.target.value })}
              placeholder="iná"
              aria-label="Iná kapacita"
              className="h-8 w-24 rounded-full border border-line bg-surface px-3 text-sm"
            />
          </div>
        </div>
        <Input label="Farba" value={value.color ?? ''} onChange={(e) => set({ color: e.target.value })} />
        <Input
          label="Kondícia batérie"
          inputMode="numeric"
          suffix="%"
          value={value.batteryHealth ?? ''}
          onChange={(e) => set({ batteryHealth: e.target.value === '' ? null : Math.min(100, Math.round(parseNum(e.target.value))) })}
        />
        <div className="flex flex-col gap-1.5">
          <Input label="IMEI *" inputMode="numeric" value={value.imei ?? ''} onChange={(e) => set({ imei: e.target.value.replace(/[^\d\s]/g, '') })} placeholder="15 číslic (*#06#)" />
          <IdentifierCheck value={value.imei} selfId={selfId} />
        </div>
        <Input label="IMEI 2 (dual SIM)" inputMode="numeric" value={value.imei2 ?? ''} onChange={(e) => set({ imei2: e.target.value.replace(/[^\d\s]/g, '') })} />
        <div className="flex flex-col gap-1.5">
          <Input label="Sériové číslo" value={value.serial ?? ''} onChange={(e) => set({ serial: e.target.value.toUpperCase() })} hint="Ak zariadenie nemá IMEI (tablet, hodinky…)" />
          {!value.imei && <IdentifierCheck value={value.serial} selfId={selfId} />}
        </div>
        <Input label="Príslušenstvo" value={value.accessories ?? ''} onChange={(e) => set({ accessories: e.target.value })} placeholder="krabica, nabíjačka, kábel…" />
      </div>
      <datalist id="cs-brands-phone">
        {BRANDS.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
    </div>
  );
}

export function GradePicker({ value, onChange }: { value: PhoneGrade; onChange: (g: PhoneGrade) => void }) {
  const ring: Record<PhoneGrade, string> = {
    A: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10',
    B: 'border-blue-500 bg-blue-50 dark:bg-blue-500/10',
    C: 'border-orange-500 bg-orange-50 dark:bg-orange-500/10',
  };
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {PHONE_GRADES.map((g) => (
        <button key={g.id} type="button" onClick={() => onChange(g.id)} className={cx('flex items-start gap-3 rounded-2xl border-2 p-3 text-left transition-colors', value === g.id ? ring[g.id] : 'border-line hover:border-primary/40')}>
          <span className={cx('flex size-9 shrink-0 items-center justify-center rounded-xl text-lg font-black', value === g.id ? 'bg-fg text-bg' : 'bg-surface-2 text-muted')}>{g.id}</span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{g.label.split(' – ')[1]}</span>
            <span className="block text-xs text-muted">{g.text}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** Kontrola funkčnosti: každá položka v poriadku / chyba / netestované. */
export function ChecksEditor({ value, onChange }: { value: Record<string, boolean | null>; onChange: (v: Record<string, boolean | null>) => void }) {
  const setAll = () => onChange(Object.fromEntries(PHONE_CHECKS.map((c) => [c.id, true])));
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[13px] font-medium text-muted">Kontrola funkčnosti</p>
        <button type="button" onClick={setAll} className="text-xs font-semibold text-primary">
          Všetko v poriadku
        </button>
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {PHONE_CHECKS.map((c) => {
          const v = value[c.id] ?? null;
          const opt = (state: boolean | null, icon: React.ReactNode, label: string, active: string) => (
            <button
              type="button"
              aria-label={`${c.label}: ${label}`}
              title={label}
              onClick={() => onChange({ ...value, [c.id]: state })}
              className={cx('flex size-7 items-center justify-center rounded-lg', v === state ? active : 'text-subtle hover:bg-surface-2')}
            >
              {icon}
            </button>
          );
          return (
            <div key={c.id} className={cx('flex items-center gap-2 rounded-xl border px-3 py-1.5', v === false ? 'border-red-300 bg-red-50/60 dark:border-red-500/40 dark:bg-red-500/10' : 'border-line')}>
              <span className="min-w-0 flex-1 truncate text-sm">{c.label}</span>
              {opt(true, <Check className="size-4" />, 'V poriadku', 'bg-emerald-500 text-white')}
              {opt(false, <X className="size-4" />, 'Chyba', 'bg-red-500 text-white')}
              {opt(null, <Minus className="size-4" />, 'Netestované', 'bg-surface-2 text-fg')}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TaskPicker({ value, onChange }: { value: PhoneTask[]; onChange: (v: PhoneTask[]) => void }) {
  const [text, setText] = useState('');
  const add = (name: string) => {
    if (!name.trim() || value.some((t) => t.name === name.trim())) return;
    onChange([...value, { id: newId(), name: name.trim(), done: false }]);
    setText('');
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {PHONE_TASK_PRESETS.map((p) => {
          const on = value.some((t) => t.name === p);
          return (
            <button
              key={p}
              type="button"
              onClick={() => (on ? onChange(value.filter((t) => t.name !== p)) : add(p))}
              className={cx('rounded-full border px-2.5 py-1 text-xs font-medium', on ? 'border-primary bg-primary-soft text-primary' : 'border-line text-muted hover:text-fg')}
            >
              {on ? '✓ ' : '+ '}
              {p}
            </button>
          );
        })}
      </div>
      {/* Bez vnoreného <form> – komponent je súčasťou formulára výkupu. */}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add(text);
          }
        }}
        onBlur={() => text.trim() && add(text)}
        placeholder="Iná úloha… (Enter)"
        className="h-9 w-full rounded-xl border border-line bg-surface px-3 text-sm"
      />
      {value.filter((t) => !PHONE_TASK_PRESETS.includes(t.name)).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value
            .filter((t) => !PHONE_TASK_PRESETS.includes(t.name))
            .map((t) => (
              <span key={t.id} className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary">
                {t.name}
                <button type="button" aria-label="Odstrániť" onClick={() => onChange(value.filter((x) => x.id !== t.id))}>
                  <X className="size-3" />
                </button>
              </span>
            ))}
        </div>
      )}
    </div>
  );
}
