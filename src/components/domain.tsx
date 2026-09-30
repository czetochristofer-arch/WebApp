import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { isBefore, startOfDay } from 'date-fns';
import { Camera, Clock, MessageCircle, MessageSquare, Phone, Plus, Search, Trash2, UserRound, X } from 'lucide-react';
import { useData } from '@/features/data';
import { ITEM_KINDS, PART_STATUSES, orderStatus, repairStatus } from '@/lib/constants';
import { fmtDay, fmtMoney, fmtPhone, intlPhone, parseNum, toDate } from '@/lib/format';
import { matches } from '@/lib/keywords';
import { newId, totals, uploadPhoto } from '@/lib/db';
import type { CustomerRef, ItemKind, LineItem, OrderStatus, Photo, RepairStatus } from '@/lib/types';
import type { Timestamp } from 'firebase/firestore';
import { Badge, Button, IconButton, Input, Select, cx } from './ui';
import { useFeedback } from './feedback';

export function RepairStatusBadge({ status }: { status: RepairStatus }) {
  const s = repairStatus(status);
  return <Badge tone={s.tone}>{s.short}</Badge>;
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const s = orderStatus(status);
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function isOverdue(due: Timestamp | null | undefined, open: boolean) {
  const d = toDate(due);
  return !!d && open && isBefore(d, startOfDay(new Date()));
}

export function DueChip({ due, open }: { due?: Timestamp | null; open: boolean }) {
  if (!due) return <span className="text-subtle">—</span>;
  const overdue = isOverdue(due, open);
  return (
    <span className={cx('inline-flex items-center gap-1 text-sm whitespace-nowrap', overdue ? 'font-semibold text-red-600 dark:text-red-400' : 'text-muted')}>
      <Clock className="size-3.5" />
      {fmtDay(due)}
    </span>
  );
}

// ------------------------------------------------------------------ kontakt so zákazníkom

export function fillTemplate(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{(\w+)\}/g, (_m, k: string) => vars[k] ?? '');
}

export function ContactButtons({ phone, message, compact }: { phone?: string; message?: string; compact?: boolean }) {
  const p = intlPhone(phone);
  if (!p) return null;
  const body = message ? encodeURIComponent(message) : '';
  const links = [
    { href: `tel:+${p}`, label: 'Zavolať', icon: <Phone className="size-4" /> },
    { href: `sms:+${p}${body ? `?&body=${body}` : ''}`, label: 'SMS', icon: <MessageSquare className="size-4" /> },
    { href: `https://wa.me/${p}${body ? `?text=${body}` : ''}`, label: 'WhatsApp', icon: <MessageCircle className="size-4" /> },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {links.map((l) => (
        <a
          key={l.label}
          href={l.href}
          target={l.label === 'WhatsApp' ? '_blank' : undefined}
          rel="noreferrer"
          className={cx(
            'inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface font-medium hover:bg-surface-2',
            compact ? 'h-8 px-2.5 text-xs' : 'h-9 px-3 text-sm',
          )}
        >
          {l.icon}
          {l.label}
        </a>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ výber zákazníka

export function CustomerPicker({ value, onChange }: { value: CustomerRef; onChange: (c: CustomerRef) => void }) {
  const { customers } = useData();
  const [focus, setFocus] = useState(false);
  const q = `${value.name ?? ''} ${value.phone ?? ''}`.trim();
  const suggestions = useMemo(() => {
    if (value.id || q.length < 2) return [];
    return customers.filter((c) => matches([c.name, c.phone, c.email, c.company], value.name || value.phone || '')).slice(0, 6);
  }, [customers, q, value.id, value.name, value.phone]);

  if (value.id) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5">
        <span className="flex size-9 items-center justify-center rounded-full bg-primary-soft text-primary">
          <UserRound className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <Link to={`/zakaznici/${value.id}`} className="block truncate font-semibold hover:underline">
            {value.name}
          </Link>
          <div className="truncate text-sm text-muted">{[fmtPhone(value.phone), value.email].filter(Boolean).join(' · ') || 'Bez kontaktu'}</div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => onChange({ name: '', phone: '', email: '' })}>
          Zmeniť
        </Button>
      </div>
    );
  }

  return (
    <div className="relative grid gap-3 sm:grid-cols-2">
      <Input
        label="Meno zákazníka"
        placeholder="Meno a priezvisko"
        value={value.name}
        autoComplete="off"
        onFocus={() => setFocus(true)}
        onBlur={() => setTimeout(() => setFocus(false), 150)}
        onChange={(e) => onChange({ ...value, name: e.target.value })}
      />
      <Input
        label="Telefón"
        type="tel"
        inputMode="tel"
        placeholder="09xx xxx xxx"
        value={value.phone ?? ''}
        autoComplete="off"
        onFocus={() => setFocus(true)}
        onBlur={() => setTimeout(() => setFocus(false), 150)}
        onChange={(e) => onChange({ ...value, phone: e.target.value })}
      />
      {focus && suggestions.length > 0 && (
        <div className="absolute top-full right-0 left-0 z-20 mt-1 overflow-hidden rounded-xl border border-line bg-surface shadow-xl">
          <div className="px-3 pt-2 pb-1 text-xs font-semibold text-subtle">Existujúci zákazníci</div>
          {suggestions.map((c) => (
            <button
              key={c.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onChange({ id: c.id, name: c.name, phone: c.phone, email: c.email })}
              className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-2"
            >
              <UserRound className="size-4 text-muted" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span>
              <span className="text-sm text-muted">{fmtPhone(c.phone)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ položky (práca, diely, tovar)

export function ItemsEditor({
  items,
  onChange,
  defaultKind = 'praca',
  showPartStatus = true,
}: {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  defaultKind?: ItemKind;
  showPartStatus?: boolean;
}) {
  const { priceList } = useData();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const found = useMemo(
    () => (search.trim() ? priceList.filter((p) => matches([p.name, p.category], search)) : priceList).slice(0, 8),
    [priceList, search],
  );
  const t = totals(items);

  const update = (id: string, patch: Partial<LineItem>) => onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const add = (item?: Partial<LineItem>) => {
    onChange([...items, { id: newId(), kind: defaultKind, name: '', qty: 1, price: 0, cost: 0, partStatus: null, ...item }]);
    setSearch('');
    setOpen(false);
  };

  return (
    <div className="space-y-3">
      {items.length > 0 && (
        <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
          {items.map((i) => (
            <div key={i.id} className="grid grid-cols-12 items-end gap-2 bg-surface p-3">
              <div className="col-span-12 sm:col-span-5">
                <input
                  value={i.name}
                  onChange={(e) => update(i.id, { name: e.target.value })}
                  placeholder="Názov (napr. Výmena displeja)"
                  className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-[15px] focus:border-primary focus:outline-none"
                />
              </div>
              <div className="col-span-4 sm:col-span-2">
                <select
                  value={i.kind}
                  onChange={(e) => update(i.id, { kind: e.target.value as ItemKind, partStatus: e.target.value === 'diel' ? i.partStatus ?? 'treba_objednat' : null })}
                  className="h-10 w-full rounded-lg border border-line bg-surface px-2 text-sm"
                  aria-label="Typ položky"
                >
                  {ITEM_KINDS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </div>
              <NumCell label="Ks" value={i.qty} onChange={(v) => update(i.id, { qty: v })} className="col-span-2 sm:col-span-1" />
              <NumCell label="Cena €" value={i.price} onChange={(v) => update(i.id, { price: v })} className="col-span-3 sm:col-span-2" />
              <NumCell label="Nákup €" value={i.cost} onChange={(v) => update(i.id, { cost: v })} className="col-span-3 sm:col-span-1" muted />
              <div className="col-span-12 flex items-center justify-end gap-2 sm:col-span-1">
                <IconButton label="Odstrániť položku" size="sm" onClick={() => onChange(items.filter((x) => x.id !== i.id))}>
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
              {showPartStatus && i.kind === 'diel' && (
                <div className="col-span-12 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted">Diel:</span>
                  {PART_STATUSES.map((ps) => (
                    <button
                      key={ps.id}
                      type="button"
                      onClick={() => update(i.id, { partStatus: ps.id })}
                      className={cx('rounded-full border px-2.5 py-0.5 text-xs font-medium', i.partStatus === ps.id ? 'border-primary bg-primary-soft text-primary' : 'border-line text-muted')}
                    >
                      {ps.label}
                    </button>
                  ))}
                  <input
                    value={i.supplier ?? ''}
                    onChange={(e) => update(i.id, { supplier: e.target.value })}
                    placeholder="Dodávateľ"
                    className="h-7 min-w-32 flex-1 rounded-lg border border-line bg-surface px-2 text-xs"
                  />
                </div>
              )}
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 bg-surface-2 px-3 py-2.5 text-sm">
            <span className="text-muted">
              Nákup: <b className="text-fg tabular">{fmtMoney(t.totalCost)}</b>
            </span>
            <span className="text-muted">
              Zisk: <b className="text-emerald-600 tabular dark:text-emerald-400">{fmtMoney(t.total - t.totalCost)}</b>
            </span>
            <span>
              Spolu: <b className="text-base tabular">{fmtMoney(t.total)}</b>
            </span>
          </div>
        </div>
      )}
      <div className="relative flex flex-wrap gap-2">
        <Button size="sm" icon={<Plus className="size-4" />} onClick={() => add()}>
          Pridať položku
        </Button>
        {priceList.length > 0 && (
          <Button size="sm" variant="ghost" icon={<Search className="size-4" />} onClick={() => setOpen((o) => !o)}>
            Z cenníka
          </Button>
        )}
        {open && (
          <div className="absolute top-full left-0 z-20 mt-1 w-full max-w-md overflow-hidden rounded-xl border border-line bg-surface shadow-xl">
            <div className="flex items-center gap-2 border-b border-line px-3">
              <Search className="size-4 text-muted" />
              <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Hľadať v cenníku…" className="h-10 flex-1 bg-transparent text-sm outline-none" />
              <IconButton label="Zavrieť" size="sm" onClick={() => setOpen(false)}>
                <X className="size-4" />
              </IconButton>
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              {found.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => add({ name: p.name, price: p.price, cost: p.cost, kind: /diel|displej|batéria|bateria/i.test(p.category) ? 'diel' : defaultKind })}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="block text-xs text-muted">{p.category}</span>
                  </span>
                  <span className="text-sm font-semibold tabular">{fmtMoney(p.price)}</span>
                </button>
              ))}
              {!found.length && <p className="px-3 py-4 text-center text-sm text-muted">Nič sa nenašlo.</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NumCell({ label, value, onChange, className, muted }: { label: string; value: number; onChange: (v: number) => void; className?: string; muted?: boolean }) {
  const [text, setText] = useState(String(value ?? 0));
  const last = useRef(value);
  if (last.current !== value && parseNum(text) !== value) {
    last.current = value;
    setText(String(value));
  }
  return (
    <label className={cx('flex flex-col gap-0.5', className)}>
      <span className="text-[11px] text-subtle">{label}</span>
      <input
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          last.current = parseNum(e.target.value);
          onChange(parseNum(e.target.value));
        }}
        onFocus={(e) => e.target.select()}
        className={cx('h-10 w-full rounded-lg border border-line bg-surface px-2 text-right text-[15px] tabular focus:border-primary focus:outline-none', muted && 'text-muted')}
      />
    </label>
  );
}

// ------------------------------------------------------------------ fotky

export function PhotoGallery({ photos, folder, onChange }: { photos: Photo[]; folder: string; onChange: (p: Photo[]) => Promise<void> | void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { run } = useFeedback();
  const [preview, setPreview] = useState<Photo | null>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    await run(async () => {
      const uploaded: Photo[] = [];
      for (const f of Array.from(files).slice(0, 10)) uploaded.push(await uploadPhoto(folder, f));
      await onChange([...photos, ...uploaded]);
    }, 'Fotky nahraté');
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {photos.map((p) => (
          <div key={p.path} className="group relative aspect-square overflow-hidden rounded-xl border border-line bg-surface-2">
            <button type="button" className="size-full" onClick={() => setPreview(p)}>
              <img src={p.url} alt={p.name ?? 'Fotka'} loading="lazy" className="size-full object-cover" />
            </button>
            <button
              type="button"
              aria-label="Odstrániť fotku"
              onClick={() => onChange(photos.filter((x) => x.path !== p.path))}
              className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line text-muted hover:border-primary hover:text-primary"
        >
          <Camera className="size-5" />
          <span className="text-xs font-medium">{busy ? 'Nahrávam…' : 'Pridať'}</span>
        </button>
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setPreview(null)}>
          <img src={preview.url} alt="" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </div>
  );
}

export function SelectStatus<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value as T)} className={className} aria-label="Stav">
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}
