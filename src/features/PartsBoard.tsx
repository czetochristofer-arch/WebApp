import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { differenceInCalendarDays } from 'date-fns';
import { CheckSquare, ClipboardCopy, PackageCheck, ShoppingCart, Square, Truck, Wrench } from 'lucide-react';
import { useData } from '@/features/data';
import { isClaim, isRepairOpen } from '@/features/metrics';
import { Button, EmptyState, Input, Segmented, cx } from '@/components/ui';
import { RepairStatusBadge } from '@/components/domain';
import { useFeedback } from '@/components/feedback';
import { setPartStatus } from '@/lib/db';
import { copyText } from '@/lib/links';
import { fmtMoney, toDate } from '@/lib/format';
import { useIsDesktop } from '@/lib/hooks';
import type { LineItem, PartStatus, Repair } from '@/lib/types';

interface PartRow {
  key: string;
  item: LineItem;
  repair: Repair;
  status: 'treba_objednat' | 'objednane' | 'dorucene';
}

const COLUMNS: { id: PartRow['status']; title: string; hint: string; tone: string; icon: ReactNode }[] = [
  { id: 'treba_objednat', title: 'Treba objednať', hint: 'Diely, ktoré ešte nie sú objednané', tone: 'border-t-red-500', icon: <ShoppingCart className="size-4 text-red-500" /> },
  { id: 'objednane', title: 'Objednané – čakáme', hint: 'Objednané u dodávateľa, ešte nedorazili', tone: 'border-t-amber-500', icon: <Truck className="size-4 text-amber-500" /> },
  { id: 'dorucene', title: 'Doručené / na sklade', hint: 'Pripravené na opravu', tone: 'border-t-emerald-500', icon: <PackageCheck className="size-4 text-emerald-500" /> },
];

/** Prehľad náhradných dielov zo všetkých rozpracovaných zákaziek (vrátane reklamácií). */
export function PartsBoard() {
  const { repairs } = useData();
  const { run, toast } = useFeedback();
  const isDesktop = useIsDesktop();
  const [mobileCol, setMobileCol] = useState<PartRow['status']>('treba_objednat');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [supplier, setSupplier] = useState('');
  const [busy, setBusy] = useState(false);

  const rows = useMemo<PartRow[]>(
    () =>
      repairs
        .filter(isRepairOpen)
        .flatMap((r) =>
          (r.items ?? [])
            .filter((i) => i.kind === 'diel')
            .map((i) => ({
              key: `${r.id}:${i.id}`,
              item: i,
              repair: r,
              // Diel bez stavu (napr. pridaný z cenníka) berieme ako neobjednaný.
              status: (!i.partStatus || i.partStatus === 'treba_objednat' ? 'treba_objednat' : i.partStatus === 'objednane' ? 'objednane' : 'dorucene') as PartRow['status'],
            })),
        )
        .sort((a, b) => (toDate(a.repair.dueAt)?.getTime() ?? Infinity) - (toDate(b.repair.dueAt)?.getTime() ?? Infinity)),
    [repairs],
  );
  const by = (s: PartRow['status']) => rows.filter((r) => r.status === s);

  const change = async (list: PartRow[], status: PartStatus, sup?: string) => {
    setBusy(true);
    // Zmeny po zákazkách – každá zákazka sa upraví samostatne v transakcii.
    const groups = new Map<string, string[]>();
    for (const p of list) groups.set(p.repair.id, [...(groups.get(p.repair.id) ?? []), p.item.id]);
    const ok = await run(async () => {
      for (const [repairId, ids] of groups) await setPartStatus(repairId, ids, status, sup);
    }, list.length > 1 ? `Upravených dielov: ${list.length}` : 'Uložené');
    setBusy(false);
    if (ok !== undefined) setSelected(new Set());
    // Upozornenie, keď sú pre zákazku pripravené všetky diely.
    if (ok !== undefined && status === 'dorucene') {
      for (const repairId of groups.keys()) {
        const r = repairs.find((x) => x.id === repairId);
        const waiting = r?.items.filter((i) => i.kind === 'diel' && !groups.get(repairId)!.includes(i.id) && (!i.partStatus || i.partStatus === 'treba_objednat' || i.partStatus === 'objednane'));
        if (r && waiting && !waiting.length) toast(`${r.number}: všetky diely sú doručené – môžete pokračovať v oprave.`);
      }
    }
  };

  const toOrder = by('treba_objednat');
  const chosen = toOrder.filter((p) => selected.has(p.key));
  const copyList = async (list: PartRow[]) => {
    const text = list.map((p) => `${p.item.qty}× ${p.item.name}${p.item.supplier ? ` (${p.item.supplier})` : ''} – ${p.repair.number}`).join('\n');
    toast((await copyText(text)) ? 'Zoznam skopírovaný – môžete ho vložiť do objednávky u dodávateľa.' : text);
  };

  if (!rows.length)
    return (
      <div className="rounded-2xl border border-line bg-surface">
        <EmptyState icon={<Wrench />} title="Žiadne diely v rozpracovaných zákazkách" text="Diely pridáte v zákazke v časti Práca a diely (typ položky „Diel“). Tu potom uvidíte, čo treba objednať." />
      </div>
    );

  const column = (c: (typeof COLUMNS)[number]) => {
    const list = by(c.id);
    // Neobjednané diely zoskupíme podľa dodávateľa – ľahšie sa objednávajú naraz.
    const groups = c.id === 'treba_objednat' ? [...new Set(list.map((p) => p.item.supplier?.trim() || ''))].sort((a, b) => (a ? (b ? a.localeCompare(b) : -1) : 1)) : [null];
    return (
      <section key={c.id} className={cx('flex flex-col overflow-hidden rounded-2xl border border-t-4 border-line bg-surface shadow-xs', c.tone)}>
        <header className="flex items-center gap-2 border-b border-line px-4 py-3">
          {c.icon}
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold">{c.title}</h3>
            <p className="truncate text-xs text-muted">{c.hint}</p>
          </div>
          <span className="text-xl font-bold tabular">{list.length}</span>
        </header>
        {list.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">Nič tu nie je.</p>
        ) : (
          <div className="divide-y divide-line">
            {groups.map((g) => {
              const items = g === null ? list : list.filter((p) => (p.item.supplier?.trim() || '') === g);
              return (
                <div key={g ?? 'all'}>
                  {g !== null && (
                    <div className="flex items-center justify-between bg-surface-2/60 px-4 py-1.5 text-xs font-semibold text-muted">
                      <span>{g || 'Bez dodávateľa'}</span>
                      <button className="hover:text-fg" onClick={() => copyList(items)}>
                        Kopírovať zoznam
                      </button>
                    </div>
                  )}
                  {items.map((p) => (
                    <PartItem
                      key={p.key}
                      p={p}
                      selectable={c.id === 'treba_objednat'}
                      selected={selected.has(p.key)}
                      onSelect={() =>
                        setSelected((s) => {
                          const n = new Set(s);
                          if (n.has(p.key)) n.delete(p.key);
                          else n.add(p.key);
                          return n;
                        })
                      }
                      busy={busy}
                      onStatus={(st) => change([p], st)}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="space-y-4">
      {chosen.length > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-primary/30 bg-primary-soft p-3 shadow-sm">
          <span className="text-sm font-semibold">Vybrané: {chosen.length}</span>
          <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Dodávateľ (nepovinné)" wrapClass="min-w-40 flex-1" className="h-9" />
          <Button size="sm" variant="primary" icon={<Truck className="size-4" />} loading={busy} onClick={() => change(chosen, 'objednane', supplier)}>
            Označiť ako objednané
          </Button>
          <Button size="sm" icon={<ClipboardCopy className="size-4" />} onClick={() => copyList(chosen)}>
            Kopírovať
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Zrušiť výber
          </Button>
        </div>
      )}
      {isDesktop ? (
        <div className="grid items-start gap-4 lg:grid-cols-3">{COLUMNS.map(column)}</div>
      ) : (
        <>
          <Segmented value={mobileCol} onChange={setMobileCol} options={COLUMNS.map((c) => ({ id: c.id, label: c.title.split(' –')[0], count: by(c.id).length }))} />
          {column(COLUMNS.find((c) => c.id === mobileCol)!)}
        </>
      )}
    </div>
  );
}

function PartItem({
  p,
  selectable,
  selected,
  onSelect,
  onStatus,
  busy,
}: {
  p: PartRow;
  selectable: boolean;
  selected: boolean;
  onSelect: () => void;
  onStatus: (s: PartStatus) => void;
  busy: boolean;
}) {
  const r = p.repair;
  const due = toDate(r.dueAt);
  const daysLeft = due ? differenceInCalendarDays(due, new Date()) : null;
  return (
    <div className={cx('flex gap-3 px-4 py-3', selected && 'bg-primary-soft/50')}>
      {selectable && (
        <button onClick={onSelect} aria-label={selected ? 'Zrušiť výber' : 'Vybrať'} className="mt-0.5 shrink-0 text-muted hover:text-primary">
          {selected ? <CheckSquare className="size-5 text-primary" /> : <Square className="size-5" />}
        </button>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          {p.item.qty > 1 && <span className="tabular">{p.item.qty}× </span>}
          {p.item.name || 'Diel bez názvu'}
        </p>
        <Link to={`/zakazky/${r.id}`} className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted hover:text-fg">
          <span className="font-semibold text-primary tabular">{r.number}</span>
          {isClaim(r) && <span className="font-semibold text-rose-600">reklamácia</span>}
          <span>
            {r.device.brand} {r.device.model} · {r.customer.name}
          </span>
        </Link>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
          <RepairStatusBadge status={r.status} />
          {p.item.cost > 0 && <span>nákup {fmtMoney(p.item.cost * p.item.qty)}</span>}
          {p.item.supplier && <span>· {p.item.supplier}</span>}
          {daysLeft !== null && <span className={cx(daysLeft < 0 ? 'font-semibold text-red-600 dark:text-red-400' : daysLeft <= 1 && 'font-semibold text-amber-600')}>· termín {daysLeft < 0 ? 'po termíne' : daysLeft === 0 ? 'dnes' : `o ${daysLeft} d.`}</span>}
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-1">
        {p.status === 'treba_objednat' && (
          <Button size="sm" variant="soft" disabled={busy} onClick={() => onStatus('objednane')}>
            Objednané
          </Button>
        )}
        {p.status === 'objednane' && (
          <Button size="sm" variant="soft" disabled={busy} onClick={() => onStatus('dorucene')}>
            Doručené
          </Button>
        )}
        {p.status !== 'treba_objednat' && (
          <button disabled={busy} className="text-[11px] text-subtle hover:text-fg" onClick={() => onStatus(p.status === 'dorucene' ? 'objednane' : 'treba_objednat')}>
            Späť
          </button>
        )}
      </div>
    </div>
  );
}
