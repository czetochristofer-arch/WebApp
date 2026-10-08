import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { doc, Timestamp } from 'firebase/firestore';
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Copy,
  Euro,
  FileText,
  History,
  Megaphone,
  PackageCheck,
  PackageX,
  Plus,
  Printer,
  Receipt,
  Save,
  ShoppingBag,
  Smartphone,
  Tag,
  Trash2,
  Undo2,
  UserRound,
  Wrench,
  X,
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { useLiveDoc } from '@/lib/hooks';
import { useAuth } from '@/features/auth';
import { useData } from '@/features/data';
import { ChecksEditor, DeviceFields, GradePicker, SellerFields } from '@/features/PhoneForm';
import { Badge, Button, Card, IconButton, Input, Modal, PageLoader, Textarea, Toggle, cx } from '@/components/ui';
import { CustomerPicker, PhotoGallery } from '@/components/domain';
import { useFeedback } from '@/components/feedback';
import { PAYMENT_METHODS, PHONE_STATUSES, PHONE_TASK_PRESETS, phoneGrade, phoneStatus } from '@/lib/constants';
import { newId } from '@/lib/db';
import { copyText } from '@/lib/links';
import { fmtDate, fmtDateTime, fmtMoney, parseNum } from '@/lib/format';
import {
  adText,
  cancelSale,
  daysInStock,
  deletePhone,
  isPhoneOpen,
  isStockPhone,
  mutatePhone,
  phoneName,
  phoneProfit,
  repairCosts,
  saleWarrantyUntil,
  sellPhone,
  setPhoneStatus,
  totalCost,
  updatePhone,
  type PhoneInput,
} from '@/lib/phones';
import type { CustomerRef, PaymentMethod, Phone, PhoneStatus } from '@/lib/types';

const DRAFT_KEYS = ['device', 'grade', 'checks', 'defects', 'seller', 'purchasePrice', 'purchasePayment', 'targetPrice', 'minPrice', 'location', 'notes', 'originNote'] as const;
type Draft = Pick<PhoneInput, (typeof DRAFT_KEYS)[number]>;
const toDraft = (p: Phone): Draft => ({
  device: { ...p.device },
  grade: p.grade,
  checks: { ...(p.checks ?? {}) },
  defects: p.defects ?? '',
  seller: { ...p.seller },
  purchasePrice: p.purchasePrice,
  purchasePayment: p.purchasePayment,
  targetPrice: p.targetPrice ?? null,
  minPrice: p.minPrice ?? null,
  location: p.location ?? '',
  notes: p.notes ?? '',
  originNote: p.originNote ?? '',
});
const sig = (d: Draft) => JSON.stringify(DRAFT_KEYS.map((k) => d[k]));

export default function PhoneDetailPage() {
  const { id = '' } = useParams();
  const { phones } = useData();
  const cached = phones.find((p) => p.id === id);
  const live = useLiveDoc<Phone>(cached ? null : doc(db, 'phones', id), cached ? 'cached' : id);
  const phone = cached ?? live.data;
  if (!phone)
    return live.loading ? (
      <PageLoader />
    ) : (
      <div className="py-20 text-center">
        <p className="font-semibold">Telefón sa nenašiel</p>
        <Link to="/telefony" className="text-sm text-primary">
          Späť na telefóny
        </Link>
      </div>
    );
  return <PhoneDetail key={phone.id} phone={phone} />;
}

function PhoneDetail({ phone }: { phone: Phone }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { isOwner } = useAuth();
  const { settings } = useData();
  const { run, confirm, toast } = useFeedback();
  const [draft, setDraft] = useState<Draft>(() => toDraft(phone));
  const [base, setBase] = useState(() => sig(toDraft(phone)));
  const dirty = sig(draft) !== base;
  const [saving, setSaving] = useState(false);
  const [selling, setSelling] = useState(false);
  const [ad, setAd] = useState(false);
  const [showSeller, setShowSeller] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  useEffect(() => {
    if (!dirty) {
      const fresh = toDraft(phone);
      setDraft(fresh);
      setBase(sig(fresh));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  const save = async () => {
    setSaving(true);
    const ok = await run(() => updatePhone(phone, draft), 'Uložené');
    if (ok !== undefined) setBase(sig(draft));
    setSaving(false);
  };

  const open = isPhoneOpen(phone);
  const st = phoneStatus(phone.status);
  const g = phoneGrade(phone.grade);
  const profit = phoneProfit({ ...phone, targetPrice: draft.targetPrice, purchasePrice: draft.purchasePrice });
  const cost = totalCost({ ...phone, purchasePrice: draft.purchasePrice });
  const price = phone.sale?.price ?? draft.targetPrice;
  const print = (kind: string) => window.open(`/tlac/telefon/${kind}/${phone.id}`, '_blank');
  const warrantyMonths = settings.phoneWarrantyMonths ?? 12;
  // Vlastné zariadenie pridané bez výkupu – nemá predávajúceho ani výkupný doklad.
  const stock = isStockPhone(phone);

  const changeStatus = async (status: PhoneStatus) => {
    if (status === 'predane') return setSelling(true);
    if (status === 'vyradene' && !(await confirm({ title: 'Vyradiť telefón?', message: 'Napr. na diely alebo neopraviteľný. Zostane v evidencii medzi vyradenými.', confirmLabel: 'Vyradiť', danger: true }))) return;
    let extra: Partial<PhoneInput> | undefined;
    if (status === 'rezervovane') {
      const who = window.prompt('Pre koho je telefón rezervovaný? (meno, telefón)', phone.reservedFor ?? '');
      if (who === null) return;
      extra = { reservedFor: who };
    }
    run(() => setPhoneStatus(phone, status, extra), 'Stav zmenený');
  };

  const remove = async () => {
    if (await confirm({ title: `Vymazať ${phone.number}?`, message: stock ? 'Záznam o zariadení aj fotky sa natrvalo odstránia.' : 'Záznam o výkupe aj fotky sa natrvalo odstránia. Výkupný doklad v účtovníctve tým nezanikne.', confirmLabel: 'Vymazať', danger: true })) {
      await run(() => deletePhone(phone), 'Vymazané');
      navigate('/telefony', { replace: true });
    }
  };

  return (
    <div className="pb-16">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <IconButton label="Späť" onClick={() => navigate(-1)} className="-ml-2">
            <ArrowLeft className="size-5" />
          </IconButton>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{phoneName(phone)}</h1>
              <Badge tone={st.tone}>{st.short}</Badge>
              <Badge tone={g.tone} dot={false}>
                Stav {phone.grade}
              </Badge>
            </div>
            <p className="mt-0.5 text-sm text-muted">
              <span className="font-semibold text-primary tabular">{phone.number}</span> · {stock ? 'vlastné, na sklade od' : 'vykúpené'} {fmtDate(phone.purchasedAt)} · {daysInStock(phone)} dní {open ? 'na sklade' : 'do predaja'}
              {phone.status === 'rezervovane' && phone.reservedFor ? ` · rezervované: ${phone.reservedFor}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!stock && (
            <Button size="sm" icon={<FileText className="size-4" />} onClick={() => print('vykup')}>
              Výkupný doklad
            </Button>
          )}
          {!stock && phone.purchasePayment === 'hotovost' && (
            <Button size="sm" icon={<Receipt className="size-4" />} onClick={() => print('vpd')}>
              VPD
            </Button>
          )}
          <Button size="sm" icon={<Tag className="size-4" />} onClick={() => print('cenovka')}>
            Cenovka
          </Button>
          <Button size="sm" icon={<Megaphone className="size-4" />} onClick={() => setAd(true)}>
            Inzerát
          </Button>
          {isOwner && (
            <IconButton label="Vymazať" size="sm" onClick={remove}>
              <Trash2 className="size-4" />
            </IconButton>
          )}
        </div>
      </div>

      {params.get('novy') && stock && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <CheckCircle2 className="size-5 text-emerald-600" />
          <span className="min-w-48 flex-1 font-medium">Zariadenie {phone.number} je pridané na sklad. Doplňte repas a cieľovú cenu, potom môžete vytlačiť cenovku.</span>
          <Button size="sm" icon={<Tag className="size-4" />} onClick={() => print('cenovka')}>
            Cenovka
          </Button>
          <IconButton label="Zavrieť" size="sm" onClick={() => setParams({}, { replace: true })}>
            <X className="size-4" />
          </IconButton>
        </div>
      )}

      {params.get('novy') && !stock && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <CheckCircle2 className="size-5 text-emerald-600" />
          <span className="min-w-48 flex-1 font-medium">
            Výkup {phone.number} je uložený. Vytlačte výkupný doklad v dvoch vyhotoveniach – podpíše ho predávajúci aj vy.
            {phone.purchasePayment === 'hotovost' ? ' Pri platbe v hotovosti aj výdavkový pokladničný doklad.' : ''}
          </span>
          <Button size="sm" variant="primary" icon={<Printer className="size-4" />} onClick={() => print('vykup')}>
            Výkupný doklad
          </Button>
          {phone.purchasePayment === 'hotovost' && (
            <Button size="sm" icon={<Receipt className="size-4" />} onClick={() => print('vpd')}>
              VPD
            </Button>
          )}
          <IconButton label="Zavrieť" size="sm" onClick={() => setParams({}, { replace: true })}>
            <X className="size-4" />
          </IconButton>
        </div>
      )}

      {/* Priebeh */}
      <div className="mb-5 flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {PHONE_STATUSES.filter((s) => s.open).map((s) => (
          <button
            key={s.id}
            onClick={() => phone.status !== s.id && changeStatus(s.id)}
            className={cx(
              'shrink-0 rounded-xl border px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
              phone.status === s.id ? 'border-primary bg-primary text-primary-fg shadow-sm' : 'border-line bg-surface text-muted hover:border-primary/50 hover:text-fg',
            )}
          >
            {s.label}
          </button>
        ))}
        {open ? (
          <>
            <button onClick={() => setSelling(true)} className="shrink-0 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300">
              Predať
            </button>
            <button onClick={() => changeStatus('vyradene')} className="shrink-0 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium text-muted hover:border-red-300 hover:text-red-600">
              Vyradiť
            </button>
          </>
        ) : (
          phone.status === 'vyradene' && (
            <button onClick={() => run(() => setPhoneStatus(phone, 'pripravene'), 'Vrátené na sklad')} className="shrink-0 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium text-muted hover:text-fg">
              Vrátiť na sklad
            </button>
          )
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Zariadenie" icon={<Smartphone className="size-4" />}>
            <DeviceFields value={draft.device} onChange={(v) => set('device', v)} selfId={phone.id} />
          </Card>
          <Card title="Stav a kontrola" icon={<ClipboardCheck className="size-4" />}>
            <div className="space-y-4">
              <GradePicker value={draft.grade} onChange={(v) => set('grade', v)} />
              <ChecksEditor value={draft.checks} onChange={(v) => set('checks', v)} />
              <Textarea label="Popis vád a poškodení" rows={3} value={draft.defects ?? ''} onChange={(e) => set('defects', e.target.value)} />
            </div>
          </Card>
          <Card title="Fotky" icon={<Camera className="size-4" />}>
            <PhotoGallery photos={phone.photos ?? []} folder={`phones/${phone.id}`} onChange={(photos) => run(() => updatePhone(phone, { photos }))} />
          </Card>
          {stock ? (
            <Card title="Pôvod zariadenia" icon={<PackageCheck className="size-4" />}>
              <Input label="Odkiaľ zariadenie máte" value={draft.originNote ?? ''} onChange={(e) => set('originNote', e.target.value)} placeholder="napr. vykúpené pred zavedením aplikácie, od dodávateľa…" />
              <p className="mt-2 text-xs text-muted">Pridané na sklad bez výkupného formulára – nemá predávajúceho ani výkupný doklad.</p>
            </Card>
          ) : (
            <Card
              title="Predávajúci"
              icon={<UserRound className="size-4" />}
              actions={
                <Button size="sm" variant="ghost" onClick={() => setShowSeller((s) => !s)}>
                  {showSeller ? 'Skryť údaje' : 'Zobraziť / upraviť'}
                </Button>
              }
            >
              {showSeller ? (
                <SellerFields value={draft.seller} onChange={(v) => set('seller', v)} />
              ) : (
                <p className="text-sm">
                  <b>{phone.seller.name}</b>
                  <span className="text-muted"> · osobné údaje sú skryté</span>
                </p>
              )}
            </Card>
          )}
          <Card title="Poznámka" icon={<FileText className="size-4" />}>
            <Textarea rows={2} value={draft.notes ?? ''} onChange={(e) => set('notes', e.target.value)} placeholder="Interná poznámka…" />
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Ekonomika" icon={<Euro className="size-4" />}>
            <dl className="space-y-2 text-sm">
              <Row label={stock ? 'Nákupná cena' : `Výkup (${draft.purchasePayment === 'hotovost' ? 'hotovosť' : 'prevod'})`} value={fmtMoney(draft.purchasePrice)} />
              <Row label="Náklady na repas" value={fmtMoney(repairCosts(phone))} />
              <Row label="Náklady spolu" value={fmtMoney(cost)} strong />
              {phone.sale && <Row label="Predané za" value={fmtMoney(phone.sale.price)} strong />}
            </dl>
            {stock && (
              <Input
                wrapClass="mt-3"
                label="Nákupná cena"
                hint="Za koľko ste zariadenie získali – pre výpočet zisku"
                inputMode="decimal"
                suffix="€"
                value={draft.purchasePrice || ''}
                onChange={(e) => set('purchasePrice', e.target.value === '' ? 0 : parseNum(e.target.value))}
              />
            )}
            {!phone.sale && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Input label="Cieľová cena" inputMode="decimal" suffix="€" value={draft.targetPrice ?? ''} onChange={(e) => set('targetPrice', e.target.value === '' ? null : parseNum(e.target.value))} />
                <Input label="Najnižšia" inputMode="decimal" suffix="€" value={draft.minPrice ?? ''} onChange={(e) => set('minPrice', e.target.value === '' ? null : parseNum(e.target.value))} />
              </div>
            )}
            {price != null && (
              <div className={cx('mt-3 rounded-xl px-3 py-2 text-sm', profit != null && profit < 0 ? 'bg-red-50 text-red-800 dark:bg-red-500/10 dark:text-red-300' : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300')}>
                {phone.sale ? 'Zisk z predaja' : 'Očakávaný zisk'}: <b className="tabular">{fmtMoney(profit)}</b>
                {price > 0 && profit != null && <span className="opacity-80"> · marža {Math.round((profit / price) * 100)} %</span>}
              </div>
            )}
          </Card>

          <RepairCard phone={phone} />

          {phone.sale ? (
            <Card title="Predaj" icon={<ShoppingBag className="size-4" />}>
              <dl className="space-y-2 text-sm">
                <Row label="Dátum" value={fmtDateTime(phone.sale.at)} />
                <Row label="Kupujúci" value={phone.sale.buyer.name || '—'} />
                <Row label="Platba" value={PAYMENT_METHODS.find((p) => p.id === phone.sale!.paymentMethod)?.label ?? '—'} />
                <Row label={`Záruka ${phone.sale.warrantyMonths} mes.`} value={`do ${fmtDate(saleWarrantyUntil(phone))}`} />
              </dl>
              <Button className="mt-3 w-full" icon={<Printer className="size-4" />} onClick={() => print('predaj')}>
                Doklad o predaji a záručný list
              </Button>
              {isOwner && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-2 w-full"
                  icon={<Undo2 className="size-4" />}
                  onClick={async () => (await confirm({ title: 'Zrušiť predaj?', message: 'Telefón sa vráti na sklad ako vystavený.', confirmLabel: 'Zrušiť predaj', danger: true })) && run(() => cancelSale(phone), 'Predaj zrušený')}
                >
                  Zrušiť predaj
                </Button>
              )}
            </Card>
          ) : (
            <Card title="Predaj a vystavenie" icon={<ShoppingBag className="size-4" />}>
              <div className="space-y-3">
                <Input label="Umiestnenie" value={draft.location ?? ''} onChange={(e) => set('location', e.target.value)} placeholder="vitrína, sklad…" />
                <Toggle checked={!!phone.listed} onChange={(v) => run(() => updatePhone(phone, { listed: v }, v ? 'Inzerované online' : 'Inzerát stiahnutý'))} label="Inzerované online" hint="Bazoš, Marketplace…" />
                {open && (
                  <Button variant="primary" className="w-full" icon={<ShoppingBag className="size-4" />} onClick={() => setSelling(true)}>
                    Predať
                  </Button>
                )}
              </div>
            </Card>
          )}

          <Card title="História" icon={<History className="size-4" />}>
            <ol className="relative space-y-3 border-l border-line pl-4">
              {[...(phone.history ?? [])].reverse().map((h, i) => (
                <li key={i} className="text-sm">
                  <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full border-2 border-surface bg-subtle" />
                  <p>{h.text}</p>
                  <p className="text-xs text-subtle">
                    {fmtDateTime(h.at)} · {h.by}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>

      {dirty && (
        <div className="fixed inset-x-0 bottom-16 z-30 flex justify-center px-4 lg:bottom-6 lg:pl-60">
          <div className="animate-slide-up flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-2.5 shadow-xl">
            <span className="text-sm font-medium">Neuložené zmeny</span>
            <Button size="sm" variant="ghost" onClick={() => setDraft(toDraft(phone))}>
              Zahodiť
            </Button>
            <Button size="sm" variant="primary" icon={<Save className="size-4" />} loading={saving} onClick={save}>
              Uložiť
            </Button>
          </div>
        </div>
      )}

      <SellDialog
        open={selling}
        onClose={() => setSelling(false)}
        phone={phone}
        defaultPrice={draft.targetPrice}
        warrantyMonths={warrantyMonths}
        onDone={() => {
          toast('Telefón predaný');
          print('predaj');
        }}
        beforeSell={dirty ? save : undefined}
      />
      <Modal
        open={ad}
        onClose={() => setAd(false)}
        title="Text inzerátu"
        footer={
          <>
            <Button onClick={() => setAd(false)}>Zavrieť</Button>
            <Button
              variant="primary"
              icon={<Copy className="size-4" />}
              onClick={async () => {
                const ok = await copyText(adText(phone, settings, warrantyMonths));
                toast(ok ? 'Text skopírovaný' : 'Skopírujte text ručne');
              }}
            >
              Kopírovať
            </Button>
          </>
        }
      >
        <Textarea rows={12} readOnly value={adText(phone, settings, warrantyMonths)} />
        <p className="mt-2 text-xs text-muted">Text sa skladá z údajov o telefóne. Pred zverejnením ho môžete upraviť – a nezabudnite priložiť fotky.</p>
      </Modal>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className={cx('text-right tabular', strong && 'text-base font-bold')}>{value}</dd>
    </div>
  );
}

/** Repas: čo treba urobiť a koľko to stálo. Zmeny sa ukladajú hneď (transakciou). */
function RepairCard({ phone }: { phone: Phone }) {
  const { run } = useFeedback();
  const [task, setTask] = useState('');
  const [costName, setCostName] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const tasks = phone.tasks ?? [];
  const costs = phone.costs ?? [];
  const allDone = tasks.length > 0 && tasks.every((t) => t.done);
  const suggestions = useMemo(() => [...new Set([...tasks.map((t) => t.name), 'Batéria', 'Displej', 'Práca', 'Ochranné sklo'])].slice(0, 6), [tasks]);

  const toggle = (id: string) =>
    run(() =>
      mutatePhone(phone.id, (p) => {
        const t = p.tasks.find((x) => x.id === id);
        return { patch: { tasks: p.tasks.map((x) => (x.id === id ? { ...x, done: !x.done } : x)) }, note: t ? `Repas: ${t.name} – ${t.done ? 'znova otvorené' : 'hotové'}` : undefined };
      }),
    );
  const addTask = (name: string) => {
    if (!name.trim()) return;
    setTask('');
    run(() => mutatePhone(phone.id, (p) => ({ patch: { tasks: [...(p.tasks ?? []), { id: newId(), name: name.trim(), done: false }] }, note: `Repas – nová úloha: ${name.trim()}` })));
  };
  const removeTask = (id: string) => run(() => mutatePhone(phone.id, (p) => ({ patch: { tasks: p.tasks.filter((x) => x.id !== id) } })));
  const addCost = () => {
    const amount = parseNum(costAmount);
    if (!costName.trim() || !(amount > 0)) return;
    run(() =>
      mutatePhone(phone.id, (p) => ({
        patch: { costs: [...(p.costs ?? []), { id: newId(), name: costName.trim(), amount, at: Timestamp.now() }] },
        note: `Náklad na repas: ${costName.trim()} ${fmtMoney(amount)}`,
      })),
    );
    setCostName('');
    setCostAmount('');
  };
  const removeCost = (id: string) =>
    run(() =>
      mutatePhone(phone.id, (p) => {
        const c = p.costs.find((x) => x.id === id);
        return { patch: { costs: p.costs.filter((x) => x.id !== id) }, note: c ? `Náklad odstránený: ${c.name} ${fmtMoney(c.amount)}` : undefined };
      }),
    );

  return (
    <Card title="Repas" icon={<Wrench className="size-4" />}>
      <div className="space-y-4">
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-muted">Čo treba urobiť</p>
          {tasks.length === 0 && <p className="mb-2 text-sm text-muted">Nič – telefón je bez opráv.</p>}
          <ul className="space-y-1">
            {tasks.map((t) => (
              <li key={t.id} className="group flex items-center gap-2">
                <button onClick={() => toggle(t.id)} aria-label={t.done ? 'Označiť ako nehotové' : 'Hotové'}>
                  {t.done ? <CheckCircle2 className="size-5 text-emerald-500" /> : <Circle className="size-5 text-subtle" />}
                </button>
                <span className={cx('min-w-0 flex-1 text-sm', t.done && 'text-muted line-through')}>{t.name}</span>
                <IconButton label="Odstrániť" size="sm" className="opacity-60 hover:opacity-100" onClick={() => removeTask(t.id)}>
                  <X className="size-3.5" />
                </IconButton>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-1">
            {PHONE_TASK_PRESETS.filter((p) => !tasks.some((t) => t.name === p))
              .slice(0, 4)
              .map((p) => (
                <button key={p} onClick={() => addTask(p)} className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted hover:text-fg">
                  + {p}
                </button>
              ))}
          </div>
          <form
            className="mt-2"
            onSubmit={(e) => {
              e.preventDefault();
              addTask(task);
            }}
          >
            <input value={task} onChange={(e) => setTask(e.target.value)} placeholder="Pridať úlohu…" className="h-9 w-full rounded-xl border border-line bg-surface px-3 text-sm" />
          </form>
          {allDone && phone.status === 'na_repas' && (
            <Button size="sm" variant="soft" className="mt-2 w-full" onClick={() => run(() => setPhoneStatus(phone, 'pripravene'), 'Pripravené na predaj')}>
              Všetko hotové → Pripravené na predaj
            </Button>
          )}
        </div>

        <div className="border-t border-line pt-4">
          <p className="mb-1.5 text-[13px] font-medium text-muted">Náklady na repas</p>
          {costs.length > 0 && (
            <ul className="mb-2 divide-y divide-line rounded-xl border border-line text-sm">
              {costs.map((c) => (
                <li key={c.id} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="tabular">{fmtMoney(c.amount)}</span>
                  <IconButton label="Odstrániť náklad" size="sm" onClick={() => removeCost(c.id)}>
                    <Trash2 className="size-3.5" />
                  </IconButton>
                </li>
              ))}
              <li className="flex justify-between bg-surface-2 px-3 py-1.5 font-semibold">
                <span>Spolu</span>
                <span className="tabular">{fmtMoney(repairCosts(phone))}</span>
              </li>
            </ul>
          )}
          <div className="flex flex-wrap gap-1">
            {suggestions.map((s) => (
              <button key={s} onClick={() => setCostName(s)} className={cx('rounded-full border px-2 py-0.5 text-[11px]', costName === s ? 'border-primary text-primary' : 'border-line text-muted hover:text-fg')}>
                {s}
              </button>
            ))}
          </div>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addCost();
            }}
          >
            <input value={costName} onChange={(e) => setCostName(e.target.value)} placeholder="Náklad (napr. batéria)" className="h-9 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-sm" />
            <input value={costAmount} onChange={(e) => setCostAmount(e.target.value)} placeholder="€" inputMode="decimal" className="h-9 w-20 rounded-xl border border-line bg-surface px-3 text-right text-sm" />
            <IconButton label="Pridať náklad" type="submit" className="border border-line">
              <Plus className="size-4" />
            </IconButton>
          </form>
        </div>
      </div>
    </Card>
  );
}

function SellDialog({
  open,
  onClose,
  phone,
  defaultPrice,
  warrantyMonths,
  onDone,
  beforeSell,
}: {
  open: boolean;
  onClose: () => void;
  phone: Phone;
  defaultPrice?: number | null;
  warrantyMonths: number;
  onDone: () => void;
  beforeSell?: () => Promise<void>;
}) {
  const { run, toast } = useFeedback();
  const [price, setPrice] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('hotovost');
  const [buyer, setBuyer] = useState<CustomerRef>({ name: '', phone: '', email: '' });
  const [months, setMonths] = useState(String(warrantyMonths));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setPrice(defaultPrice != null ? String(defaultPrice) : '');
      setMonths(String(warrantyMonths));
    }
  }, [open, defaultPrice, warrantyMonths]);
  const amount = parseNum(price);
  const profit = amount - totalCost(phone);
  const below = phone.minPrice != null && amount > 0 && amount < phone.minPrice;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Predať ${phoneName(phone)}`}
      size="md"
      footer={
        <>
          <Button onClick={onClose}>Zrušiť</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              if (!(amount > 0)) return toast('Zadajte predajnú cenu.', 'error');
              setBusy(true);
              if (beforeSell) await beforeSell();
              const ok = await run(() => sellPhone(phone, { price: amount, paymentMethod: method, buyer, warrantyMonths: Math.max(0, Math.round(parseNum(months))), at: Timestamp.now() }));
              setBusy(false);
              if (ok !== undefined) {
                onClose();
                onDone();
              }
            }}
          >
            Predať
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Predajná cena" inputMode="decimal" suffix="€" value={price} onChange={(e) => setPrice(e.target.value)} autoFocus />
          <Input label="Záruka" inputMode="numeric" suffix="mes." value={months} onChange={(e) => setMonths(e.target.value)} />
        </div>
        {amount > 0 && (
          <p className={cx('rounded-xl px-3 py-2 text-sm', profit < 0 ? 'bg-red-50 text-red-800 dark:bg-red-500/10 dark:text-red-300' : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300')}>
            Zisk <b className="tabular">{fmtMoney(profit)}</b> (náklady {fmtMoney(totalCost(phone))})
            {below && <span className="block font-semibold">Pozor: pod najnižšou cenou {fmtMoney(phone.minPrice)}</span>}
          </p>
        )}
        <div className="grid grid-cols-3 gap-2">
          {PAYMENT_METHODS.map((p) => (
            <button key={p.id} type="button" onClick={() => setMethod(p.id)} className={cx('rounded-xl border px-2 py-2.5 text-sm font-medium', method === p.id ? 'border-primary bg-primary-soft text-primary' : 'border-line')}>
              {p.label}
            </button>
          ))}
        </div>
        <div>
          <p className="mb-2 text-[13px] font-medium text-muted">Kupujúci (nepovinné – na záručný list)</p>
          <CustomerPicker value={buyer} onChange={setBuyer} />
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <PackageX className="size-3.5" /> Po predaji sa otvorí doklad o predaji so záručným listom.
        </p>
      </div>
    </Modal>
  );
}
