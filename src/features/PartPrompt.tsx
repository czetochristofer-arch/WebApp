import { useEffect, useState, type ReactNode } from 'react';
import { CircleSlash, PackageCheck, ShoppingCart, Truck } from 'lucide-react';
import { Badge, Button, Input, Modal, cx } from '@/components/ui';
import { PART_STATUSES, type Tone } from '@/lib/constants';
import { newId } from '@/lib/db';
import { parseNum } from '@/lib/format';
import type { Device, LineItem, PartStatus } from '@/lib/types';

/** Diely zákazky (položky typu „diel“). */
export const partItems = (items?: LineItem[]) => (items ?? []).filter((i) => i.kind === 'diel');

/** Súhrnný stav dielov zákazky – čo je najdôležitejšie riešiť. */
export function partSummary(items?: LineItem[]): { tone: Tone; label: string } | null {
  const parts = partItems(items);
  if (!parts.length) return null;
  if (parts.some((i) => !i.partStatus || i.partStatus === 'treba_objednat')) return { tone: 'red', label: 'Diel treba objednať' };
  if (parts.some((i) => i.partStatus === 'objednane')) return { tone: 'amber', label: 'Diel objednaný' };
  if (parts.every((i) => i.partStatus === 'na_sklade')) return { tone: 'green', label: 'Diel skladom' };
  return { tone: 'green', label: 'Diel doručený' };
}

export function PartChip({ items, className }: { items?: LineItem[]; className?: string }) {
  const s = partSummary(items);
  if (!s) return null;
  return (
    <Badge tone={s.tone} className={className}>
      {s.label}
    </Badge>
  );
}

/** Odhad názvu dielu z popisu poruchy („rozbitý displej“ → „Displej iPhone 13“). */
function guessPartName(problem: string, device: Pick<Device, 'brand' | 'model'>) {
  const p = problem.toLowerCase();
  const rules: [RegExp, string][] = [
    [/displej|sklo na displeji|dotyk|lcd|oled|obrazovk/, 'Displej'],
    [/bat[eé]ri|vybíja|vybija|nedrží/, 'Batéria'],
    [/nabíj|nabij|konektor|usb/, 'Nabíjací konektor'],
    [/zadn[éeý] sklo|zadný kryt|zadny kryt/, 'Zadné sklo'],
    [/kamer|fotoapar/, 'Kamera'],
    [/reprodukt|nepočuť|nepocut|zvuk/, 'Reproduktor'],
    [/mikrof/, 'Mikrofón'],
  ];
  const hit = rules.find(([re]) => re.test(p))?.[1];
  return hit ? `${hit} ${[device.brand, device.model].filter(Boolean).join(' ')}`.trim() : '';
}

type Choice = PartStatus | 'none';

const CHOICES: { id: Choice; title: string; text: string; icon: ReactNode; active: string }[] = [
  { id: 'na_sklade', title: 'Diel mám skladom', text: 'Môžem hneď opravovať', icon: <PackageCheck className="size-5" />, active: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10' },
  { id: 'treba_objednat', title: 'Treba objednať', text: 'Zaradí sa do zoznamu na objednanie', icon: <ShoppingCart className="size-5" />, active: 'border-red-500 bg-red-50 dark:bg-red-500/10' },
  { id: 'objednane', title: 'Už je objednaný', text: 'Čakám na doručenie', icon: <Truck className="size-5" />, active: 'border-amber-500 bg-amber-50 dark:bg-amber-500/10' },
  { id: 'none', title: 'Diel netreba', text: 'Softvér, čistenie, diagnostika…', icon: <CircleSlash className="size-5" />, active: 'border-fg bg-surface-2' },
];

/**
 * Okno „Diel na opravu“: pri novej zákazke sa opýta, či je diel skladom alebo ho treba objednať,
 * v detaile zákazky pridá ďalší diel. Vráti položky zákazky so zapísaným dielom.
 */
export function PartDialog({
  open,
  onClose,
  items,
  device,
  problem,
  onConfirm,
  busy,
  mode = 'new',
}: {
  open: boolean;
  onClose: () => void;
  items: LineItem[];
  device: Pick<Device, 'brand' | 'model'>;
  problem: string;
  onConfirm: (items: LineItem[], added?: LineItem) => void;
  busy?: boolean;
  /** „new“ = pri ukladaní novej zákazky (dá sa zvoliť aj „Diel netreba“), „add“ = pridanie dielu k existujúcej zákazke. */
  mode?: 'new' | 'add';
}) {
  const existing = mode === 'new' ? partItems(items) : [];
  const [statuses, setStatuses] = useState<Record<string, PartStatus>>({});
  const [choice, setChoice] = useState<Choice | null>(null);
  const [name, setName] = useState('');
  const [supplier, setSupplier] = useState('');
  const [cost, setCost] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setStatuses(Object.fromEntries(partItems(items).map((i) => [i.id, i.partStatus ?? 'treba_objednat'])));
    setChoice(mode === 'add' ? 'treba_objednat' : null);
    setName(guessPartName(problem, device));
    setSupplier('');
    setCost('');
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Pri zákazke, ktorá už diely má, je nový diel nepovinný.
  const [addMore, setAddMore] = useState(false);
  useEffect(() => setAddMore(false), [open]);
  const askNew = mode === 'add' || !existing.length || addMore;
  const choices = CHOICES.filter((c) => c.id !== 'none' || (mode === 'new' && !existing.length));
  const isPart = choice && choice !== 'none';

  const confirm = () => {
    let next = items.map((i) => (statuses[i.id] && i.kind === 'diel' ? { ...i, partStatus: statuses[i.id] } : i));
    let added: LineItem | undefined;
    if (askNew) {
      if (!choice && !existing.length) return setError('Vyberte, či diel máte skladom, treba ho objednať, alebo diel netreba.');
      if (isPart) {
        if (!name.trim()) return setError('Napíšte, aký diel (napr. Displej iPhone 13).');
        added = { id: newId(), kind: 'diel', name: name.trim(), qty: 1, price: 0, cost: parseNum(cost) || 0, partStatus: choice, ...(supplier.trim() ? { supplier: supplier.trim() } : {}) };
        next = [...next, added];
      }
    }
    onConfirm(next, added);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'add' ? 'Pridať diel' : 'Diel na opravu'}
      size="md"
      footer={
        <>
          <Button onClick={onClose}>Späť</Button>
          <Button variant="primary" loading={busy} onClick={confirm}>
            {mode === 'add' ? 'Pridať diel' : 'Uložiť zákazku'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {existing.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium">Diely v zákazke – potvrďte stav:</p>
            <ul className="space-y-2">
              {existing.map((i) => (
                <li key={i.id} className="rounded-xl border border-line p-3">
                  <p className="mb-2 text-sm font-semibold">{i.name || 'Diel bez názvu'}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {PART_STATUSES.filter((s) => s.id !== 'dorucene').map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setStatuses((st) => ({ ...st, [i.id]: s.id }))}
                        className={cx(
                          'rounded-full border px-3 py-1 text-xs font-semibold',
                          statuses[i.id] === s.id ? 'border-primary bg-primary-soft text-primary' : 'border-line text-muted hover:text-fg',
                        )}
                      >
                        {s.id === 'na_sklade' ? 'Mám skladom' : s.label}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
            {!addMore && (
              <button type="button" onClick={() => setAddMore(true)} className="mt-2 text-sm font-semibold text-primary">
                + Pridať ďalší diel
              </button>
            )}
          </div>
        )}

        {askNew && (
          <>
            {mode === 'new' && !existing.length && <p className="text-sm text-muted">Potrebujete na túto opravu diel?</p>}
            <div className="grid grid-cols-2 gap-2">
              {choices.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setChoice(c.id);
                    setError('');
                  }}
                  className={cx('flex items-start gap-2.5 rounded-2xl border-2 p-3 text-left transition-colors', choice === c.id ? c.active : 'border-line hover:border-primary/40')}
                >
                  <span className={cx('mt-0.5 shrink-0', choice === c.id ? 'text-fg' : 'text-muted')}>{c.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{c.title}</span>
                    <span className="block text-xs text-muted">{c.text}</span>
                  </span>
                </button>
              ))}
            </div>
            {isPart && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Aký diel *" wrapClass="sm:col-span-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="napr. Displej iPhone 13" autoFocus />
                <Input label="Dodávateľ" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="nepovinné" />
                <Input label="Nákupná cena" inputMode="decimal" suffix="€" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="nepovinné" />
                <p className="text-xs text-muted sm:col-span-2">Diel sa zapíše do položiek zákazky bez predajnej ceny – cenu pre zákazníka zadáte pri práci alebo dielu ako doteraz.</p>
              </div>
            )}
          </>
        )}
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
      </div>
    </Modal>
  );
}
