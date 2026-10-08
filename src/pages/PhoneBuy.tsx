import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import { AlertTriangle, ArrowLeft, Building2, Camera, ClipboardCheck, Euro, FileSignature, PackagePlus, Save, ShieldCheck, Smartphone, Sparkles, UserRound } from 'lucide-react';
import { useData } from '@/features/data';
import { ChecksEditor, DeviceFields, GradePicker, SellerFields, TaskPicker } from '@/features/PhoneForm';
import { Button, Card, IconButton, Input, PageHeader, Segmented, Textarea, cx } from '@/components/ui';
import { PhotoGallery } from '@/components/domain';
import { useFeedback } from '@/components/feedback';
import { newRepairId } from '@/lib/db';
import { createPhone, type PhoneInput } from '@/lib/phones';
import { fmtMoney, parseNum } from '@/lib/format';
import { amountInWords } from '@/lib/words';

function emptyPhone(): PhoneInput {
  return {
    status: 'pripravene',
    grade: 'B',
    device: { type: 'mobil', brand: '', model: '', storage: '', color: '', imei: '', imei2: '', serial: '', batteryHealth: null, accessories: '' },
    checks: {},
    defects: '',
    seller: { name: '', phone: '', address: '', birthDate: '', idDocument: '', email: '', iban: '' },
    purchasePrice: 0,
    purchasePayment: 'hotovost',
    purchasedAt: Timestamp.now(),
    sellerDeclaration: false,
    tasks: [],
    costs: [],
    targetPrice: null,
    minPrice: null,
    location: '',
    listed: false,
    reservedFor: '',
    sale: null,
    photos: [],
    notes: '',
  };
}

export default function PhoneBuyPage() {
  const { settings } = useData();
  const navigate = useNavigate();
  const { run, toast } = useFeedback();
  const id = useMemo(() => newRepairId(), []);
  const [params, setParams] = useSearchParams();
  // „sklad“ = vlastné zariadenie pridané bez výkupu (bez predávajúceho a výkupného dokladu).
  const stock = params.get('rezim') === 'sklad';
  const [acquired, setAcquired] = useState('');
  const [d, setD] = useState<PhoneInput>(emptyPhone);
  const [priceText, setPriceText] = useState('');
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof PhoneInput>(k: K, v: PhoneInput[K]) => setD((x) => ({ ...x, [k]: v }));
  const firmMissing = !settings.ico || !settings.address;
  const margin = d.targetPrice != null && d.purchasePrice ? d.targetPrice - d.purchasePrice : null;

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const s = d.seller;
    if (!d.device.brand.trim() || !d.device.model.trim()) return toast('Zadajte značku a model zariadenia.', 'error');
    if (stock) return saveStock();
    if (!s.name.trim() || !s.phone?.trim() || !s.address?.trim() || !s.birthDate)
      return toast('Vyplňte údaje predávajúceho: meno, telefón, trvalé bydlisko a dátum narodenia.', 'error');
    if (!d.device.imei?.trim() && !d.device.serial?.trim()) return toast('Zadajte IMEI alebo sériové číslo.', 'error');
    if (!(d.purchasePrice > 0)) return toast('Zadajte výkupnú cenu.', 'error');
    if (d.purchasePayment === 'prevod' && !s.iban?.trim()) return toast('Pri platbe prevodom zadajte číslo účtu predávajúceho.', 'error');
    if (!d.sellerDeclaration) return toast('Predávajúci musí potvrdiť čestné vyhlásenie.', 'error');
    setSaving(true);
    const res = await run(() =>
      createPhone(
        {
          ...d,
          // Ak treba ešte niečo opraviť, telefón ide najprv na repas.
          status: d.tasks.some((t) => !t.done) ? 'na_repas' : 'pripravene',
          device: { ...d.device, imei: d.device.imei?.replace(/\s/g, ''), imei2: d.device.imei2?.replace(/\s/g, '') },
          purchasedAt: Timestamp.now(),
        },
        settings.phonePrefix || 'V',
        id,
      ),
    );
    setSaving(false);
    if (res && typeof res === 'object') {
      toast(`Výkup ${res.number} uložený`);
      navigate(`/telefony/${res.id}?novy=1`, { replace: true });
    }
  };

  const saveStock = async () => {
    setSaving(true);
    const res = await run(() =>
      createPhone(
        {
          ...d,
          origin: 'sklad',
          seller: { name: '' },
          sellerDeclaration: false,
          status: d.tasks.some((t) => !t.done) ? 'na_repas' : 'pripravene',
          device: { ...d.device, imei: d.device.imei?.replace(/\s/g, ''), imei2: d.device.imei2?.replace(/\s/g, '') },
          purchasedAt: acquired ? Timestamp.fromDate(new Date(acquired + 'T12:00')) : Timestamp.now(),
        },
        settings.phoneStockPrefix || 'S',
        id,
      ),
    );
    setSaving(false);
    if (res && typeof res === 'object') {
      navigate(`/telefony/${res.id}?novy=1`, { replace: true });
    }
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl">
      <PageHeader
        title={stock ? 'Pridať vlastné zariadenie' : 'Výkup telefónu'}
        subtitle={
          stock ? 'Zariadenie, ktoré už vlastníte – bez predávajúceho a výkupného dokladu' : 'Výkupný doklad – kúpna zmluva s predávajúcim (aj pre účtovníctvo)'
        }
        back={
          <IconButton label="Späť" onClick={() => navigate(-1)} className="-ml-2">
            <ArrowLeft className="size-5" />
          </IconButton>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-2">
        {(
          [
            { id: 'vykup', icon: <FileSignature className="size-5" />, title: 'Výkup od zákazníka', text: 'S výkupným dokladom a údajmi predávajúceho' },
            { id: 'sklad', icon: <PackagePlus className="size-5" />, title: 'Vlastné zariadenie', text: 'Už ho vlastníte – len ho pridáte na sklad' },
          ] as const
        ).map((o) => {
          const active = (o.id === 'sklad') === stock;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => setParams(o.id === 'sklad' ? { rezim: 'sklad' } : {}, { replace: true })}
              className={cx(
                'flex items-start gap-3 rounded-2xl border p-3 text-left transition-colors',
                active ? 'border-primary bg-primary-soft' : 'border-line bg-surface hover:border-primary/40',
              )}
            >
              <span className={cx('mt-0.5', active ? 'text-primary' : 'text-muted')}>{o.icon}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{o.title}</span>
                <span className="block text-xs text-muted">{o.text}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="space-y-4">
        {!stock && (
          <>
            <Card title="Predávajúci" icon={<UserRound className="size-4" />}>
              <SellerFields value={d.seller} onChange={(v) => set('seller', v)} />
            </Card>

            <Card title="Kupujúci (vaša firma)" icon={<Building2 className="size-4" />}>
              <div className="text-sm">
                <p className="font-semibold">{settings.legalName || settings.name}</p>
                <p className="text-muted">{settings.address || 'adresa nie je vyplnená'}</p>
                <p className="text-muted">
                  {[
                    settings.ico && `IČO ${settings.ico}`,
                    settings.dic && `DIČ ${settings.dic}`,
                    settings.vatPayer && settings.icdph && `IČ DPH ${settings.icdph}`,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'IČO nie je vyplnené'}
                </p>
              </div>
              {firmMissing && (
                <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>
                    Na doklad pre účtovníctvo doplňte obchodné meno, adresu, IČO a DIČ v{' '}
                    <Link to="/nastavenia" className="font-semibold underline">
                      Nastaveniach
                    </Link>
                    .
                  </span>
                </p>
              )}
            </Card>
          </>
        )}

        <Card title="Zariadenie" icon={<Smartphone className="size-4" />}>
          <DeviceFields value={d.device} onChange={(v) => set('device', v)} />
        </Card>

        <Card title="Stav a kontrola" icon={<ClipboardCheck className="size-4" />}>
          <div className="space-y-4">
            <GradePicker value={d.grade} onChange={(g) => set('grade', g)} />
            <ChecksEditor value={d.checks} onChange={(v) => set('checks', v)} />
            <Textarea
              label="Popis vád a poškodení"
              rows={3}
              value={d.defects ?? ''}
              onChange={(e) => set('defects', e.target.value)}
              placeholder="napr. škrabanec na displeji vpravo hore, otlačený roh, slabšia batéria…"
            />
          </div>
        </Card>

        <Card title="Fotky zariadenia" icon={<Camera className="size-4" />}>
          <PhotoGallery photos={d.photos} folder={`phones/${id}`} onChange={(photos) => set('photos', photos)} />
        </Card>

        {stock ? (
          <Card title="Nadobudnutie" icon={<Euro className="size-4" />}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Nákupná cena"
                inputMode="decimal"
                suffix="€"
                value={priceText}
                onChange={(e) => {
                  setPriceText(e.target.value);
                  set('purchasePrice', parseNum(e.target.value));
                }}
                hint="Nepovinné – za koľko ste zariadenie získali (na výpočet zisku)"
              />
              <Input label="Dátum nadobudnutia" type="date" value={acquired} onChange={(e) => setAcquired(e.target.value)} hint="Prázdne = dnes" />
              <Input
                label="Odkiaľ zariadenie máte"
                wrapClass="sm:col-span-2"
                value={d.originNote ?? ''}
                onChange={(e) => set('originNote', e.target.value)}
                placeholder="napr. výkup z papierovej evidencie, od dodávateľa, protiúčet…"
              />
            </div>
          </Card>
        ) : (
          <Card title="Výkupná cena a platba" icon={<Euro className="size-4" />}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Výkupná cena *"
                inputMode="decimal"
                suffix="€"
                value={priceText}
                onChange={(e) => {
                  setPriceText(e.target.value);
                  set('purchasePrice', parseNum(e.target.value));
                }}
                hint={d.purchasePrice > 0 ? `Slovom: ${amountInWords(d.purchasePrice)}` : undefined}
              />
              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-muted">Spôsob úhrady</span>
                <Segmented
                  value={d.purchasePayment}
                  onChange={(v) => set('purchasePayment', v)}
                  options={[
                    { id: 'hotovost', label: 'V hotovosti' },
                    { id: 'prevod', label: 'Prevodom na účet' },
                  ]}
                />
              </div>
              {d.purchasePayment === 'prevod' && (
                <Input
                  label="IBAN predávajúceho *"
                  wrapClass="sm:col-span-2"
                  value={d.seller.iban ?? ''}
                  onChange={(e) => set('seller', { ...d.seller, iban: e.target.value.toUpperCase() })}
                  placeholder="SK.."
                />
              )}
            </div>
          </Card>
        )}

        <Card title="Plán predaja" icon={<Sparkles className="size-4" />}>
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-[13px] font-medium text-muted">Čo treba urobiť pred predajom (repas)</p>
              <TaskPicker value={d.tasks} onChange={(v) => set('tasks', v)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                label="Cieľová predajná cena"
                inputMode="decimal"
                suffix="€"
                value={d.targetPrice ?? ''}
                onChange={(e) => set('targetPrice', e.target.value === '' ? null : parseNum(e.target.value))}
                hint={margin != null ? `Hrubá marža ${fmtMoney(margin)} (pred nákladmi na repas)` : undefined}
              />
              <Input
                label="Najnižšia cena"
                inputMode="decimal"
                suffix="€"
                value={d.minPrice ?? ''}
                onChange={(e) => set('minPrice', e.target.value === '' ? null : parseNum(e.target.value))}
                hint="Pod ktorú pri zjednávaní nejdete"
              />
              <Input label="Umiestnenie" value={d.location ?? ''} onChange={(e) => set('location', e.target.value)} placeholder="sklad, vitrína…" />
            </div>
            <Textarea label="Interná poznámka" rows={2} value={d.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
          </div>
        </Card>

        {!stock && (
          <label
            className={cx(
              'flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-4 text-sm',
              d.sellerDeclaration ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10' : 'border-line bg-surface',
            )}
          >
            <input
              type="checkbox"
              checked={d.sellerDeclaration}
              onChange={(e) => set('sellerDeclaration', e.target.checked)}
              className="mt-0.5 size-5 accent-[var(--primary)]"
            />
            <span>
              <span className="flex items-center gap-1.5 font-semibold">
                <ShieldCheck className="size-4" /> Predávajúci potvrdil čestné vyhlásenie
              </span>
              <span className="mt-0.5 block text-muted">
                Je výlučným vlastníkom zariadenia, nie je odcudzené, zablokované ani zaťažené právom tretej osoby, a odhlásil sa zo svojich účtov (iCloud,
                Google). Vyhlásenie je súčasťou výkupného dokladu a predávajúci ho podpisuje.
              </span>
            </span>
          </label>
        )}
      </div>

      <div className="sticky bottom-20 z-10 mt-6 flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-line bg-surface/95 p-3 shadow-lg backdrop-blur lg:bottom-4">
        {d.purchasePrice > 0 && (
          <span className="mr-auto text-sm text-muted">
            {stock ? 'Nákupná cena' : 'Výkup za'} <b className="text-fg">{fmtMoney(d.purchasePrice)}</b>
          </span>
        )}
        <Button onClick={() => navigate(-1)}>Zrušiť</Button>
        <Button type="submit" variant="primary" icon={<Save className="size-4" />} loading={saving}>
          {stock ? 'Pridať na sklad' : 'Uložiť výkup'}
        </Button>
      </div>
    </form>
  );
}
