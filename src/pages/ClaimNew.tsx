import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc, getDocs, limit, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { addDays, addMonths, endOfDay } from 'date-fns';
import { ArrowLeft, Camera, Cpu, FileQuestion, Package, Save, Search, ShieldAlert, ShieldCheck, UserRound, Wrench, X } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useData } from '@/features/data';
import { emptyRepair } from '@/features/RepairForm';
import { isClaim } from '@/features/metrics';
import { Badge, Button, Card, IconButton, Input, PageHeader, Segmented, Textarea, cx } from '@/components/ui';
import { CustomerPicker, PhotoGallery } from '@/components/domain';
import { useFeedback } from '@/components/feedback';
import { BRANDS, CLAIM_DAYS, CLAIM_RESOLUTIONS, DEVICE_TYPES, warrantyUntil } from '@/lib/constants';
import { col, createRepair, newRepairId, type RepairInput } from '@/lib/db';
import { fmtDate, toDate } from '@/lib/format';
import { matches, searchToken } from '@/lib/keywords';
import { useDebounced } from '@/lib/hooks';
import type { ClaimInfo, ClaimResolution, Order, Repair } from '@/lib/types';

/** Zákonná záruka na predaný tovar. */
const GOODS_WARRANTY_MONTHS = 24;

type Original =
  | { kind: 'oprava'; repair: Repair }
  | { kind: 'nakup'; order: Order }
  | { kind: 'iny' };

function originalInfo(o: Original, defaultMonths: number) {
  if (o.kind === 'oprava') {
    const closed = toDate(o.repair.closedAt);
    const until = closed ? warrantyUntil(o.repair, closed, defaultMonths) : null;
    return { number: o.repair.number, date: closed, until };
  }
  if (o.kind === 'nakup') {
    const closed = toDate(o.order.closedAt);
    return { number: o.order.number, date: closed, until: closed ? addMonths(closed, GOODS_WARRANTY_MONTHS) : null };
  }
  return { number: null, date: null, until: null };
}

export default function ClaimNewPage() {
  const { settings, repairs, orders } = useData();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { run, toast } = useFeedback();
  const id = useMemo(() => newRepairId(), []);
  const [original, setOriginal] = useState<Original | null>(null);
  const [manual, setManual] = useState({ number: '', date: '', type: 'oprava' as 'oprava' | 'nakup', what: '' });
  const [draft, setDraft] = useState<RepairInput>(() => ({ ...emptyRepair(settings.defaultWarrantyMonths), kind: 'reklamacia' }));
  const [requested, setRequested] = useState<ClaimResolution>('oprava');
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof RepairInput>(k: K, v: RepairInput[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const dev = draft.device;
  const setDev = (patch: Partial<RepairInput['device']>) => set('device', { ...dev, ...patch });

  const pick = (o: Original) => {
    setOriginal(o);
    if (o.kind === 'oprava') {
      const r = o.repair;
      setDraft((d) => ({ ...d, customer: { ...r.customer, id: r.customerId ?? r.customer.id }, device: { ...r.device, passcode: r.device.passcode ?? '' } }));
    } else if (o.kind === 'nakup') {
      const ord = o.order;
      setDraft((d) => ({ ...d, customer: { ...ord.customer, id: ord.customerId ?? ord.customer.id }, device: { ...d.device, type: 'ine', model: ord.items.map((i) => i.name).join(', ') } }));
    }
  };

  // Z detailu zákazky / objednávky sa prichádza s predvybraným originálom.
  useEffect(() => {
    const repairId = params.get('zakazka');
    const orderId = params.get('objednavka');
    if (repairId) {
      const cached = repairs.find((r) => r.id === repairId);
      if (cached) pick({ kind: 'oprava', repair: cached });
      else getDoc(doc(db, 'repairs', repairId)).then((s) => s.exists() && pick({ kind: 'oprava', repair: { id: s.id, ...s.data() } as Repair }));
    } else if (orderId) {
      const cached = orders.find((o) => o.id === orderId);
      if (cached) pick({ kind: 'nakup', order: cached });
      else getDoc(doc(db, 'orders', orderId)).then((s) => s.exists() && pick({ kind: 'nakup', order: { id: s.id, ...s.data() } as Order }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const info = original
    ? original.kind === 'iny'
      ? (() => {
          const date = manual.date ? new Date(manual.date + 'T12:00') : null;
          return { number: manual.number || null, date, until: date ? addMonths(date, manual.type === 'nakup' ? GOODS_WARRANTY_MONTHS : settings.defaultWarrantyMonths) : null };
        })()
      : originalInfo(original, settings.defaultWarrantyMonths)
    : null;
  const inWarranty = info?.until ? endOfDay(info.until) >= new Date() : null;

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!original || !info) return toast('Vyberte, čo zákazník reklamuje.', 'error');
    if (!draft.customer.name.trim()) return toast('Zadajte meno zákazníka.', 'error');
    if (!dev.brand.trim() && !dev.model.trim()) return toast('Zadajte zariadenie alebo tovar.', 'error');
    if (!draft.problem.trim()) return toast('Popíšte reklamovanú vadu.', 'error');
    const claim: ClaimInfo = {
      source: original.kind,
      originalId: original.kind === 'oprava' ? original.repair.id : original.kind === 'nakup' ? original.order.id : null,
      originalNumber: info.number,
      originalDate: info.date ? Timestamp.fromDate(info.date) : null,
      warrantyUntil: info.until ? Timestamp.fromDate(endOfDay(info.until)) : null,
      inWarranty,
      requested,
      resolution: null,
      resolutionNote: original.kind === 'iny' && manual.what ? `Pôvodne: ${manual.what}` : '',
      resolvedAt: null,
    };
    setSaving(true);
    const res = await run(() =>
      createRepair(
        {
          ...draft,
          kind: 'reklamacia',
          claim,
          status: 'prijate',
          // Termín = posledný deň zákonnej lehoty na vybavenie.
          dueAt: Timestamp.fromDate(endOfDay(addDays(new Date(), CLAIM_DAYS))),
        },
        settings.claimPrefix || 'R',
        id,
      ),
    );
    setSaving(false);
    if (res && typeof res === 'object') {
      toast(`Reklamácia ${res.number} prijatá`);
      navigate(`/zakazky/${res.id}?nova=1`, { replace: true });
    }
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl">
      <PageHeader
        title="Nová reklamácia"
        subtitle={`Prijatie zariadenia alebo tovaru do reklamácie · zákonná lehota na vybavenie ${CLAIM_DAYS} dní`}
        back={
          <IconButton label="Späť" onClick={() => navigate(-1)} className="-ml-2">
            <ArrowLeft className="size-5" />
          </IconButton>
        }
      />

      <div className="space-y-4">
        <Card title="Čo zákazník reklamuje" icon={<ShieldAlert className="size-4" />}>
          {!original ? (
            <OriginalPicker onPick={pick} />
          ) : (
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 p-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  {original.kind === 'oprava' ? <Wrench className="size-4" /> : original.kind === 'nakup' ? <Package className="size-4" /> : <FileQuestion className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  {original.kind === 'oprava' && (
                    <>
                      <p className="font-semibold">
                        Oprava {original.repair.number} · {original.repair.device.brand} {original.repair.device.model}
                      </p>
                      <p className="text-sm text-muted">
                        {original.repair.customer.name} · {original.repair.problem}
                      </p>
                    </>
                  )}
                  {original.kind === 'nakup' && (
                    <>
                      <p className="font-semibold">
                        Nákup {original.order.number} · {original.order.items.map((i) => i.name).join(', ')}
                      </p>
                      <p className="text-sm text-muted">{original.order.customer.name}</p>
                    </>
                  )}
                  {original.kind === 'iny' && <p className="font-semibold">Záznam mimo aplikácie (papierová evidencia)</p>}
                  {info?.date && (
                    <p className="mt-1 text-sm text-muted">
                      {original.kind === 'nakup' || manual.type === 'nakup' ? 'Predané' : 'Vydané'} {fmtDate(info.date)}
                    </p>
                  )}
                </div>
                <Button size="sm" variant="ghost" icon={<X className="size-4" />} onClick={() => setOriginal(null)}>
                  Zmeniť
                </Button>
              </div>
              {original.kind === 'iny' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Segmented
                    className="sm:col-span-2"
                    size="sm"
                    value={manual.type}
                    onChange={(v) => setManual((m) => ({ ...m, type: v }))}
                    options={[
                      { id: 'oprava', label: 'Oprava u nás' },
                      { id: 'nakup', label: 'Tovar kúpený u nás' },
                    ]}
                  />
                  <Input label="Číslo dokladu / zákazky" value={manual.number} onChange={(e) => setManual((m) => ({ ...m, number: e.target.value }))} placeholder="napr. z papierového zošita" />
                  <Input label={manual.type === 'nakup' ? 'Dátum predaja' : 'Dátum opravy'} type="date" value={manual.date} onChange={(e) => setManual((m) => ({ ...m, date: e.target.value }))} />
                  <Input
                    label="Čo bolo opravené / kúpené"
                    wrapClass="sm:col-span-2"
                    value={manual.what}
                    onChange={(e) => setManual((m) => ({ ...m, what: e.target.value }))}
                    placeholder="napr. výmena displeja iPhone 12"
                  />
                </div>
              )}
              {info?.until ? (
                inWarranty ? (
                  <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
                    <ShieldCheck className="size-4" /> V záruke do {fmtDate(info.until)}
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                    <ShieldAlert className="size-4" />
                    <span className="flex-1">Záruka skončila {fmtDate(info.until)}. Reklamáciu môžete prijať, alebo zariadenie prijať ako bežnú platenú opravu.</span>
                    <Button size="sm" onClick={() => navigate('/zakazky/nova', { state: { customer: draft.customer.id ? draft.customer : undefined } })}>
                      Bežná oprava
                    </Button>
                  </div>
                )
              ) : (
                original.kind !== 'iny' && <p className="text-sm text-muted">Pôvodná zákazka ešte nebola vydaná – záruka sa počíta od vydania.</p>
              )}
            </div>
          )}
        </Card>

        {original && (
          <>
            <Card title="Zákazník" icon={<UserRound className="size-4" />}>
              <CustomerPicker value={draft.customer} onChange={(c) => set('customer', c)} />
            </Card>

            <Card title="Zariadenie / tovar" icon={<Cpu className="size-4" />}>
              <div className="space-y-3">
                <Segmented value={dev.type} onChange={(v) => setDev({ type: v })} options={DEVICE_TYPES} size="sm" />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input label="Značka" list="cs-brands-claim" value={dev.brand} onChange={(e) => setDev({ brand: e.target.value })} />
                  <Input label="Model / tovar" value={dev.model} onChange={(e) => setDev({ model: e.target.value })} />
                  <Input label="IMEI / sériové číslo" value={dev.imei ?? ''} onChange={(e) => setDev({ imei: e.target.value })} />
                  <Input label="Kód / heslo na odomknutie" value={dev.passcode ?? ''} onChange={(e) => setDev({ passcode: e.target.value })} hint="Neukazuje sa na vytlačenom protokole" />
                  <Input label="Príslušenstvo" value={dev.accessories ?? ''} onChange={(e) => setDev({ accessories: e.target.value })} placeholder="nabíjačka, obal…" />
                  <Input label="Stav pri prevzatí" value={dev.condition ?? ''} onChange={(e) => setDev({ condition: e.target.value })} placeholder="škrabance, prasknutý rám…" />
                </div>
                <datalist id="cs-brands-claim">
                  {BRANDS.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </div>
            </Card>

            <Card title="Reklamovaná vada" icon={<ShieldAlert className="size-4" />}>
              <div className="space-y-3">
                <Textarea label="Popis vady (ako ju opisuje zákazník)" rows={3} value={draft.problem} onChange={(e) => set('problem', e.target.value)} placeholder="napr. displej po 2 mesiacoch bliká, nereaguje dotyk v hornej časti" />
                <div>
                  <p className="mb-1.5 text-[13px] font-medium text-muted">Zákazník požaduje</p>
                  <Segmented
                    size="sm"
                    value={requested}
                    onChange={setRequested}
                    options={CLAIM_RESOLUTIONS.filter((c) => c.id !== 'zamietnuta').map((c) => ({ id: c.id, label: c.short }))}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Textarea label="Poznámka pre zákazníka (tlačí sa)" value={draft.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
                  <Textarea label="Interná poznámka" value={draft.internalNotes ?? ''} onChange={(e) => set('internalNotes', e.target.value)} />
                </div>
              </div>
            </Card>

            <Card title="Fotky" icon={<Camera className="size-4" />}>
              <PhotoGallery photos={draft.photos} folder={`repairs/${id}`} onChange={(photos) => set('photos', photos)} />
            </Card>
          </>
        )}
      </div>

      {original && (
        <div className="sticky bottom-20 z-10 mt-6 flex justify-end gap-2 rounded-2xl border border-line bg-surface/95 p-3 shadow-lg backdrop-blur lg:bottom-4">
          <Button onClick={() => navigate(-1)}>Zrušiť</Button>
          <Button type="submit" variant="primary" icon={<Save className="size-4" />} loading={saving}>
            Prijať reklamáciu
          </Button>
        </div>
      )}
    </form>
  );
}

/** Vyhľadanie pôvodnej opravy alebo nákupu (vydané zákazky a objednávky). */
function OriginalPicker({ onPick }: { onPick: (o: Original) => void }) {
  const { repairs, orders, settings } = useData();
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 300);
  const [remote, setRemote] = useState<{ repairs: Repair[]; orders: Order[] }>({ repairs: [], orders: [] });

  useEffect(() => {
    const token = searchToken(dq);
    if (!token) return setRemote({ repairs: [], orders: [] });
    let alive = true;
    Promise.all([
      getDocs(query(col.repairs(), where('keywords', 'array-contains', token), orderBy('createdAt', 'desc'), limit(30))),
      getDocs(query(col.orders(), where('keywords', 'array-contains', token), orderBy('createdAt', 'desc'), limit(20))),
    ])
      .then(([r, o]) => {
        if (!alive) return;
        setRemote({ repairs: r.docs.map((d) => ({ id: d.id, ...d.data() }) as Repair), orders: o.docs.map((d) => ({ id: d.id, ...d.data() }) as Order) });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [dq]);

  const results = useMemo(() => {
    const uniq = <T extends { id: string }>(list: T[]) => [...new Map(list.map((x) => [x.id, x])).values()];
    const rs = uniq([...repairs, ...remote.repairs])
      .filter((r) => r.status === 'vydane' && !isClaim(r))
      .filter((r) => !dq.trim() || matches([r.number, r.customer?.name, r.customer?.phone, r.device.brand, r.device.model, r.device.imei, r.problem], dq))
      .sort((a, b) => (toDate(b.closedAt)?.getTime() ?? 0) - (toDate(a.closedAt)?.getTime() ?? 0))
      .slice(0, dq.trim() ? 15 : 6);
    const os = uniq([...orders, ...remote.orders])
      .filter((o) => o.status === 'vydana')
      .filter((o) => !dq.trim() || matches([o.number, o.customer?.name, o.customer?.phone, ...o.items.map((i) => i.name)], dq))
      .sort((a, b) => (toDate(b.closedAt)?.getTime() ?? 0) - (toDate(a.closedAt)?.getTime() ?? 0))
      .slice(0, dq.trim() ? 10 : 4);
    return { rs, os };
  }, [repairs, orders, remote, dq]);

  const row = (key: string, icon: ReactNode, title: string, sub: string, until: Date | null, onClick: () => void) => {
    const valid = until ? endOfDay(until) >= new Date() : null;
    return (
      <button key={key} type="button" onClick={onClick} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{title}</span>
          <span className="block truncate text-xs text-muted">{sub}</span>
        </span>
        {until && (
          <Badge tone={valid ? 'green' : 'gray'} className="hidden sm:inline-flex">
            {valid ? `záruka do ${fmtDate(until, 'd. M. yyyy')}` : 'po záruke'}
          </Badge>
        )}
      </button>
    );
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Meno, telefón, číslo zákazky, IMEI, model…" className="pl-9" />
      </div>
      <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
        {results.rs.map((r) =>
          row(
            r.id,
            <Wrench className="size-4" />,
            `${r.number} · ${r.device.brand} ${r.device.model}`,
            `${r.customer.name} · ${r.problem} · vydané ${fmtDate(r.closedAt)}`,
            toDate(r.closedAt) ? warrantyUntil(r, toDate(r.closedAt)!, settings.defaultWarrantyMonths) : null,
            () => onPick({ kind: 'oprava', repair: r }),
          ),
        )}
        {results.os.map((o) =>
          row(
            o.id,
            <Package className="size-4" />,
            `${o.number} · ${o.items.map((i) => i.name).join(', ')}`,
            `${o.customer.name} · predané ${fmtDate(o.closedAt)}`,
            toDate(o.closedAt) ? addMonths(toDate(o.closedAt)!, GOODS_WARRANTY_MONTHS) : null,
            () => onPick({ kind: 'nakup', order: o }),
          ),
        )}
        {!results.rs.length && !results.os.length && <p className="px-3 py-4 text-center text-sm text-muted">{dq ? 'Nič sa nenašlo medzi vydanými zákazkami a objednávkami.' : 'Zatiaľ žiadne vydané zákazky.'}</p>}
        <button type="button" onClick={() => onPick({ kind: 'iny' })} className={cx('flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2')}>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
            <FileQuestion className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Nie je v aplikácii</span>
            <span className="block text-xs text-muted">Oprava alebo predaj z papierovej evidencie – údaje zadáte ručne</span>
          </span>
        </button>
      </div>
      <p className="text-xs text-subtle">Zobrazujú sa vydané zákazky a predané objednávky. Staršie nájdete vyhľadaním.</p>
    </div>
  );
}
