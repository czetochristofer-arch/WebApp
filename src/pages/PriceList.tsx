import { useMemo, useState } from 'react';
import { Pencil, Plus, Search, Tags, Trash2 } from 'lucide-react';
import { useData } from '@/features/data';
import { Button, EmptyState, IconButton, Input, Modal, PageHeader, Textarea } from '@/components/ui';
import { useFeedback } from '@/components/feedback';
import { deletePriceItem, savePriceItem } from '@/lib/db';
import { fmtMoney, parseNum } from '@/lib/format';
import { matches } from '@/lib/keywords';
import type { PriceItem } from '@/lib/types';

export default function PriceListPage() {
  const { priceList } = useData();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Partial<PriceItem> | null>(null);
  const { run, confirm } = useFeedback();

  const groups = useMemo(() => {
    const m = new Map<string, PriceItem[]>();
    for (const p of priceList.filter((p) => matches([p.name, p.category, p.note], q))) {
      const k = p.category || 'Ostatné';
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'sk'));
  }, [priceList, q]);

  const categories = [...new Set(priceList.map((p) => p.category).filter(Boolean))];

  return (
    <div>
      <PageHeader
        title="Cenník"
        subtitle="Ceny opráv a tovaru – rýchlo ich vložíte do zákazky a pozná ich aj AI asistent"
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing({ category: categories[0] ?? 'Opravy' })}>
            Pridať položku
          </Button>
        }
      />
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hľadať v cenníku…" className="pl-9" />
      </div>
      {groups.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface">
          <EmptyState icon={<Tags />} title="Cenník je prázdny" text="Pridajte najčastejšie opravy, napr. „Výmena displeja iPhone 13 – OLED“, s predajnou a nákupnou cenou." />
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(([cat, items]) => (
            <div key={cat} className="overflow-hidden rounded-2xl border border-line bg-surface">
              <div className="border-b border-line bg-surface-2 px-4 py-2 text-sm font-semibold">{cat}</div>
              <ul className="divide-y divide-line">
                {items.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{p.name}</p>
                      {p.note && <p className="truncate text-xs text-muted">{p.note}</p>}
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular">{fmtMoney(p.price)}</p>
                      {p.cost > 0 && <p className="text-xs text-muted tabular">nákup {fmtMoney(p.cost)}</p>}
                    </div>
                    <IconButton label="Upraviť" size="sm" onClick={() => setEditing(p)}>
                      <Pencil className="size-4" />
                    </IconButton>
                    <IconButton
                      label="Vymazať"
                      size="sm"
                      onClick={async () => (await confirm({ title: 'Vymazať položku?', message: p.name, danger: true, confirmLabel: 'Vymazať' })) && run(() => deletePriceItem(p.id))}
                    >
                      <Trash2 className="size-4" />
                    </IconButton>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      <PriceDialog value={editing} categories={categories} onClose={() => setEditing(null)} />
    </div>
  );
}

function PriceDialog({ value, categories, onClose }: { value: Partial<PriceItem> | null; categories: string[]; onClose: () => void }) {
  const { run } = useFeedback();
  const [d, setD] = useState<Partial<PriceItem>>({});
  const [last, setLast] = useState<Partial<PriceItem> | null>(null);
  if (value !== last) {
    setLast(value);
    if (value) setD(value);
  }
  const save = async () => {
    if (!d.name?.trim()) return;
    const ok = await run(
      () => savePriceItem({ name: d.name!.trim(), category: d.category?.trim() || 'Ostatné', price: d.price ?? 0, cost: d.cost ?? 0, note: d.note ?? '' }, d.id),
      'Uložené',
    );
    if (ok) onClose();
  };
  return (
    <Modal
      open={!!value}
      onClose={onClose}
      title={d.id ? 'Upraviť položku' : 'Nová položka cenníka'}
      footer={
        <>
          <Button onClick={onClose}>Zrušiť</Button>
          <Button variant="primary" onClick={save} disabled={!d.name?.trim()}>
            Uložiť
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Názov" value={d.name ?? ''} onChange={(e) => setD({ ...d, name: e.target.value })} autoFocus wrapClass="sm:col-span-2" placeholder="Výmena displeja iPhone 13 – OLED" />
        <Input label="Kategória" list="cs-price-cats" value={d.category ?? ''} onChange={(e) => setD({ ...d, category: e.target.value })} />
        <datalist id="cs-price-cats">
          {[...new Set([...categories, 'Displeje', 'Batérie', 'Nabíjanie', 'Softvér', 'Príslušenstvo', 'Ostatné'])].map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Predajná cena" suffix="€" inputMode="decimal" value={d.price ?? ''} onChange={(e) => setD({ ...d, price: parseNum(e.target.value) })} />
          <Input label="Nákupná cena" suffix="€" inputMode="decimal" value={d.cost ?? ''} onChange={(e) => setD({ ...d, cost: parseNum(e.target.value) })} />
        </div>
        <Textarea label="Poznámka" value={d.note ?? ''} onChange={(e) => setD({ ...d, note: e.target.value })} wrapClass="sm:col-span-2" rows={2} />
      </div>
    </Modal>
  );
}
