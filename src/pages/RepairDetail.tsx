import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { doc } from 'firebase/firestore';
import { addDays, setHours, startOfDay } from 'date-fns';
import {
  ArrowLeft,
  CalendarPlus,
  Camera,
  CheckCircle2,
  Copy,
  ExternalLink,
  History,
  PackageCheck,
  PackageOpen,
  ShieldCheck,
  Printer,
  Save,
  Send,
  Sparkles,
  Tag,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { useLiveDoc } from '@/lib/hooks';
import { useAuth } from '@/features/auth';
import { useData } from '@/features/data';
import { RepairFormSections, type RepairDraft } from '@/features/RepairForm';
import { EventDialog, type EventDraftInit } from '@/features/EventDialog';
import { useShell } from '@/components/Layout';
import { Badge, Button, Card, IconButton, Input, Modal, PageLoader, Select, cx } from '@/components/ui';
import { ContactButtons, PhotoGallery, RepairStatusBadge, fillTemplate } from '@/components/domain';
import { useFeedback } from '@/components/feedback';
import { PAYMENT_METHODS, REPAIR_STATUSES, eventType, priority, warrantyLabel, warrantyOf, warrantyUntil } from '@/lib/constants';
import { addRepairNote, deleteRepair, setRepairStatus, updateRepair } from '@/lib/db';
import { fmtDate, fmtDateTime, fmtDay, fmtMoney, fmtTime } from '@/lib/format';
import { copyText, statusUrl } from '@/lib/links';
import { isClaim, receivedAt } from '@/features/metrics';
import { ClaimPanel, LinkedClaims } from '@/features/ClaimPanel';
import type { PaymentMethod, Repair } from '@/lib/types';

const DRAFT_KEYS: (keyof RepairDraft)[] = [
  'customer', 'device', 'problem', 'diagnosis', 'items', 'estimate', 'deposit', 'warrantyMonths', 'dueAt', 'priority', 'notes', 'internalNotes',
];

function toDraft(r: Repair, defaultMonths: number): RepairDraft {
  const w = warrantyOf(r, defaultMonths);
  return {
    status: r.status,
    priority: r.priority ?? 'normalna',
    customerId: r.customerId ?? null,
    customer: r.customer ?? { name: '' },
    device: { ...r.device, type: r.device?.type ?? 'mobil', brand: r.device?.brand ?? '', model: r.device?.model ?? '' },
    problem: r.problem ?? '',
    diagnosis: r.diagnosis ?? '',
    items: r.items ?? [],
    estimate: r.estimate ?? null,
    deposit: r.deposit ?? 0,
    paid: r.paid ?? false,
    paymentMethod: r.paymentMethod ?? null,
    paidAt: r.paidAt ?? null,
    // Staršie zákazky so zárukou v dňoch sa v editore zobrazia v mesiacoch (zaokrúhlene).
    warrantyMonths: 'days' in w && w.days !== undefined ? Math.max(1, Math.round(w.days / 30)) : w.months,
    dueAt: r.dueAt ?? null,
    notes: r.notes ?? '',
    internalNotes: r.internalNotes ?? '',
    photos: r.photos ?? [],
  };
}

const sig = (d: RepairDraft) => JSON.stringify(DRAFT_KEYS.map((k) => d[k]));

export function RepairDetailPage() {
  const { id = '' } = useParams();
  const { repairs } = useData();
  const cached = repairs.find((r) => r.id === id);
  const live = useLiveDoc<Repair>(cached ? null : doc(db, 'repairs', id), cached ? 'cached' : id);
  const repair = cached ?? live.data;
  if (!repair) return live.loading ? <PageLoader /> : <NotFound />;
  return <RepairDetail key={repair.id} repair={repair} />;
}

function NotFound() {
  return (
    <div className="py-20 text-center">
      <p className="font-semibold">Zákazka sa nenašla</p>
      <Link to="/zakazky" className="text-sm text-primary">
        Späť na zákazky
      </Link>
    </div>
  );
}

function RepairDetail({ repair }: { repair: Repair }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { isOwner } = useAuth();
  const { settings, events } = useData();
  const shell = useShell();
  const { run, confirm, toast } = useFeedback();

  const [draft, setDraft] = useState<RepairDraft>(() => toDraft(repair, settings.defaultWarrantyMonths));
  const [base, setBase] = useState(() => sig(toDraft(repair, settings.defaultWarrantyMonths)));
  const dirty = sig(draft) !== base;
  const [saving, setSaving] = useState(false);
  const [handover, setHandover] = useState(false);
  const [eventInit, setEventInit] = useState<EventDraftInit | null>(null);
  const [note, setNote] = useState('');
  const claim = isClaim(repair);
  const [msgKind, setMsgKind] = useState<'hotovo' | 'schvalenie' | 'odkaz' | 'prazdna'>(repair.status === 'hotove' ? 'hotovo' : 'odkaz');

  // Keď sa zákazka zmení inde (iné zariadenie, AI asistent, zoznam dielov) a tu nič neupravujete, prevezmeme zmeny.
  const prevRepair = useRef(repair);
  useEffect(() => {
    const fresh = toDraft(repair, settings.defaultWarrantyMonths);
    const old = prevRepair.current;
    prevRepair.current = repair;
    if (!dirty) {
      setDraft(fresh);
      setBase(sig(fresh));
    } else {
      // Rozpracované úpravy necháme, ale stav dielov zmenený inde (napr. „objednané“) neprepíšeme starým.
      const mergeParts = (items: RepairDraft['items']) =>
        items.map((i) => {
          const before = old.items?.find((x) => x.id === i.id);
          const now = repair.items?.find((x) => x.id === i.id);
          if (!before || !now || i.partStatus !== before.partStatus) return i;
          return { ...i, partStatus: now.partStatus, supplier: i.supplier === before.supplier ? now.supplier : i.supplier };
        });
      setDraft((d) => ({ ...d, status: fresh.status, photos: fresh.photos, paid: fresh.paid, items: mergeParts(d.items) }));
      setBase((b) => {
        const baseDraft = { ...fresh };
        return b === sig(toDraft(old, settings.defaultWarrantyMonths)) ? sig(baseDraft) : b;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repair]);

  const set = <K extends keyof RepairDraft>(k: K, v: RepairDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const save = async () => {
    setSaving(true);
    const patch: Partial<RepairDraft> = {};
    for (const k of DRAFT_KEYS) (patch as Record<string, unknown>)[k] = draft[k];
    const ok = await run(() => updateRepair(repair, patch), 'Uložené');
    if (ok !== undefined) setBase(sig(draft));
    setSaving(false);
  };

  const amount = draft.items.length ? draft.items.reduce((s, i) => s + i.qty * i.price, 0) : draft.estimate ?? 0;
  const remaining = Math.max(0, amount - (draft.deposit || 0));
  const closed = repair.status === 'vydane' || repair.status === 'zrusene';
  const linkedEvents = useMemo(() => events.filter((e) => e.repairId === repair.id).sort((a, b) => a.start.toMillis() - b.start.toMillis()), [events, repair.id]);

  const deviceName = `${repair.device.brand} ${repair.device.model}`.trim();
  const trackUrl = statusUrl(repair.id);
  const messages = {
    hotovo: claim
      ? `Dobrý deň, Vaša reklamácia ${repair.number} (${deviceName}) je vybavená a zariadenie si môžete vyzdvihnúť.${remaining > 0 ? ` Doplatok: ${fmtMoney(remaining)}.` : ''} ${settings.name}`
      : fillTemplate(settings.smsReadyTemplate, { zariadenie: deviceName, cislo: repair.number, cena: fmtMoney(remaining), firma: settings.name, odkaz: trackUrl }),
    schvalenie: `Dobrý deň, k zákazke ${repair.number} (${deviceName}): ${repair.diagnosis || 'diagnostika je hotová'}. Cena opravy: ${fmtMoney(amount)}. Súhlasíte s opravou? ${settings.name}`,
    odkaz: `Dobrý deň, stav opravy zariadenia ${deviceName} (zákazka ${repair.number}) môžete sledovať tu: ${trackUrl} ${settings.name}`,
    prazdna: '',
  };
  const warrantyEnd = repair.status === 'vydane' && repair.closedAt ? warrantyUntil(repair, repair.closedAt.toDate(), settings.defaultWarrantyMonths) : null;

  const changeStatus = (status: Repair['status']) => {
    if (status === 'vydane') return setHandover(true);
    run(() => setRepairStatus(repair, status), 'Stav zmenený');
  };

  const remove = async () => {
    if (await confirm({ title: `Vymazať zákazku ${repair.number}?`, message: 'Zákazka aj jej fotky sa natrvalo odstránia.', confirmLabel: 'Vymazať', danger: true })) {
      await run(() => deleteRepair(repair), 'Zákazka vymazaná');
      navigate('/zakazky', { replace: true });
    }
  };

  const print = (kind: string) => window.open(`/tlac/${kind}/${repair.id}`, '_blank');

  return (
    <div className="pb-16">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <IconButton label="Späť" onClick={() => navigate(-1)} className="-ml-2">
            <ArrowLeft className="size-5" />
          </IconButton>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight tabular">{repair.number}</h1>
              {claim && <Badge tone="red">Reklamácia{repair.claim?.originalNumber ? ` k ${repair.claim.originalNumber}` : ''}</Badge>}
              <RepairStatusBadge status={repair.status} />
              {(repair.priority === 'vysoka' || repair.priority === 'urgentna') && <Badge tone={priority(repair.priority).tone}>{priority(repair.priority).label} priorita</Badge>}
            </div>
            <p className="mt-0.5 truncate text-sm text-muted">
              {deviceName} · {repair.customer.name} · {repair.status === 'oznamene' ? `oznámené ${fmtDate(repair.createdAt)}` : `prijaté ${fmtDate(receivedAt(repair))}`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<Printer className="size-4" />} onClick={() => print('protokol')}>
            {claim ? 'Reklamačný protokol' : 'Protokol'}
          </Button>
          <Button size="sm" icon={<Tag className="size-4" />} onClick={() => print('stitok')}>
            Štítok
          </Button>
          <Button size="sm" variant="soft" icon={<Sparkles className="size-4" />} onClick={() => shell.openAssistant(`Pomôž mi so zákazkou ${repair.number}: `)}>
            AI
          </Button>
          {isOwner && (
            <IconButton label="Vymazať zákazku" size="sm" onClick={remove}>
              <Trash2 className="size-4" />
            </IconButton>
          )}
        </div>
      </div>

      {params.get('nova') && repair.status === 'oznamene' && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
          <span className="flex-1 font-medium">Zákazka {repair.number} je zapísaná ako oznámená. Protokol a štítok vytlačíte, keď zákazník zariadenie prinesie.</span>
          <IconButton label="Zavrieť" size="sm" onClick={() => setParams({}, { replace: true })}>
            <X className="size-4" />
          </IconButton>
        </div>
      )}
      {params.get('nova') && repair.status !== 'oznamene' && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <CheckCircle2 className="size-5 text-emerald-600" />
          <span className="flex-1 font-medium">
            {claim ? `Reklamácia ${repair.number} je prijatá. Vytlačte zákazníkovi reklamačný protokol a na zariadenie štítok.` : `Zákazka ${repair.number} je uložená. Vytlačte zákazníkovi preberací protokol a na zariadenie štítok.`}
          </span>
          <Button size="sm" variant="primary" icon={<Printer className="size-4" />} onClick={() => print('protokol')}>
            Protokol
          </Button>
          <Button size="sm" icon={<Tag className="size-4" />} onClick={() => print('stitok')}>
            Štítok
          </Button>
          <IconButton label="Zavrieť" size="sm" onClick={() => setParams({}, { replace: true })}>
            <X className="size-4" />
          </IconButton>
        </div>
      )}

      {repair.status === 'oznamene' && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-pink-200 bg-pink-50 px-4 py-3 text-sm dark:border-pink-500/30 dark:bg-pink-500/10">
          <PackageOpen className="size-5 shrink-0 text-pink-600 dark:text-pink-300" />
          <span className="min-w-48 flex-1">
            <b>Zákazka je oznámená</b> – zákazník zariadenie ešte neprinesie{repair.dueAt ? `, dohodnuté ${fmtDay(repair.dueAt)}` : ''}. Keď ho prinesie, prijmite ho jedným klikom.
          </span>
          <Button
            size="sm"
            variant="primary"
            icon={<PackageCheck className="size-4" />}
            onClick={async () => {
              const ok = await run(() => updateRepair(repair, { status: 'prijate' }, 'Zákazník priniesol zariadenie'), 'Zariadenie prijaté');
              if (ok !== undefined) setParams({ nova: '1' }, { replace: true });
            }}
          >
            Zariadenie prinesené
          </Button>
        </div>
      )}

      {/* Priebeh zákazky */}
      <div className="mb-5 flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {REPAIR_STATUSES.filter((s) => s.id !== 'zrusene' && !(claim && s.id === 'oznamene')).map((s) => {
          const active = repair.status === s.id;
          return (
            <button
              key={s.id}
              onClick={() => !active && changeStatus(s.id)}
              className={cx(
                'shrink-0 rounded-xl border px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                active ? 'border-primary bg-primary text-primary-fg shadow-sm' : 'border-line bg-surface text-muted hover:border-primary/50 hover:text-fg',
              )}
            >
              {s.label}
            </button>
          );
        })}
        {repair.status !== 'zrusene' ? (
          <button
            onClick={async () => (await confirm({ title: 'Zrušiť zákazku?', message: 'Napr. zákazník opravu odmietol alebo sa zariadenie nedá opraviť.', confirmLabel: 'Zrušiť zákazku', danger: true })) && changeStatus('zrusene')}
            className="shrink-0 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium text-muted hover:border-red-300 hover:text-red-600"
          >
            Zrušiť
          </button>
        ) : (
          <Badge tone="red">Zrušené</Badge>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <RepairFormSections draft={draft} set={set} claim={claim} />
          <Card title="Fotky" icon={<Camera className="size-4" />}>
            <PhotoGallery photos={draft.photos} folder={`repairs/${repair.id}`} onChange={(photos) => run(() => updateRepair(repair, { photos }))} />
          </Card>
        </div>

        <div className="space-y-4">
          {claim && <ClaimPanel repair={repair} />}
          <Card title="Platba">
            <dl className="space-y-2 text-sm">
              <Row label={draft.items.length ? 'Suma za opravu' : 'Predbežná cena'} value={fmtMoney(amount)} strong />
              <Row label="Záloha" value={fmtMoney(draft.deposit)} />
              <Row label="Zostáva doplatiť" value={repair.paid ? fmtMoney(0) : fmtMoney(remaining)} strong />
            </dl>
            <div className="mt-3 flex items-center justify-between">
              {repair.paid ? (
                <Badge tone="green">Zaplatené{repair.paymentMethod ? ` – ${PAYMENT_METHODS.find((p) => p.id === repair.paymentMethod)?.label}` : ''}</Badge>
              ) : (
                <Badge tone="amber">Nezaplatené</Badge>
              )}
              {repair.paid && (
                <Button size="sm" variant="ghost" icon={<Undo2 className="size-4" />} onClick={() => run(() => updateRepair(repair, { paid: false, paymentMethod: null, paidAt: null }, 'Platba zrušená'))}>
                  Zrušiť platbu
                </Button>
              )}
            </div>
            {!closed ? (
              <>
                <Button
                  variant="primary"
                  className="mt-4 w-full"
                  icon={<PackageCheck className="size-4" />}
                  disabled={claim && !repair.claim?.resolution}
                  onClick={() => setHandover(true)}
                >
                  Vydať zákazníkovi
                </Button>
                {claim && !repair.claim?.resolution && <p className="mt-2 text-center text-xs text-muted">Pred vydaním zvoľte výsledok reklamácie.</p>}
              </>
            ) : (
              <Button className="mt-4 w-full" icon={<Printer className="size-4" />} onClick={() => print('vydajka')}>
                {claim ? 'Tlačiť doklad o vybavení' : 'Tlačiť výdajku'}
              </Button>
            )}
            {warrantyEnd && !claim && (
              <p className={cx('mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-sm', warrantyEnd >= new Date() ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-surface-2 text-muted')}>
                <ShieldCheck className="size-4 shrink-0" />
                {warrantyEnd >= new Date() ? `V záruke do ${fmtDate(warrantyEnd)}` : `Záruka skončila ${fmtDate(warrantyEnd)}`}
              </p>
            )}
          </Card>

          {!claim && repair.status === 'vydane' && <LinkedClaims repair={repair} />}
          <Card title="Kontaktovať zákazníka">
            {repair.customer.phone ? (
              <div className="space-y-3">
                <Select value={msgKind} onChange={(e) => setMsgKind(e.target.value as typeof msgKind)} aria-label="Typ správy">
                  <option value="hotovo">Hotovo – môže si prísť</option>
                  <option value="schvalenie">Schválenie ceny opravy</option>
                  <option value="odkaz">Odkaz na sledovanie opravy</option>
                  <option value="prazdna">Bez textu</option>
                </Select>
                {messages[msgKind] && <p className="rounded-xl bg-surface-2 p-3 text-sm break-words text-muted">{messages[msgKind]}</p>}
                <ContactButtons phone={repair.customer.phone} message={messages[msgKind]} />
              </div>
            ) : (
              <p className="text-sm text-muted">Zákazník nemá zadaný telefón.</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <span className="mr-auto text-xs text-muted">Stránka so stavom opravy pre zákazníka</span>
              <Button size="sm" variant="ghost" icon={<Copy className="size-4" />} onClick={() => copyText(trackUrl).then((ok) => toast(ok ? 'Odkaz skopírovaný' : trackUrl))}>
                Kopírovať
              </Button>
              <Button size="sm" variant="ghost" icon={<ExternalLink className="size-4" />} onClick={() => window.open(`/stav/${repair.id}`, '_blank')}>
                Náhľad
              </Button>
            </div>
          </Card>

          <Card
            title="Plán práce"
            actions={
              <Button
                size="sm"
                variant="ghost"
                icon={<CalendarPlus className="size-4" />}
                onClick={() => {
                  const start = setHours(startOfDay(addDays(new Date(), 1)), 9);
                  setEventInit({ title: `Oprava ${deviceName} – ${repair.customer.name}`, type: 'praca', start, repairId: repair.id });
                }}
              >
                Naplánovať
              </Button>
            }
          >
            <p className="text-sm">
              Termín pre zákazníka: <b>{repair.dueAt ? fmtDay(repair.dueAt) : 'nezadaný'}</b>
            </p>
            {linkedEvents.length > 0 && (
              <ul className="mt-3 space-y-2">
                {linkedEvents.map((e) => (
                  <li key={e.id}>
                    <button
                      onClick={() => setEventInit({ ...e, start: e.start.toDate(), end: e.end.toDate() })}
                      className="flex w-full items-center gap-2 rounded-xl border border-line px-3 py-2 text-left text-sm hover:bg-surface-2"
                    >
                      <span className="font-semibold tabular">{fmtDay(e.start)}</span>
                      <span className="text-muted">{e.allDay ? '' : fmtTime(e.start)}</span>
                      <span className="min-w-0 flex-1 truncate">{e.title}</span>
                      <Badge tone={eventType(e.type).tone} dot={false}>
                        {eventType(e.type).label}
                      </Badge>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="História" icon={<History className="size-4" />}>
            <form
              className="mb-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!note.trim()) return;
                run(() => addRepairNote(repair.id, note.trim()));
                setNote('');
              }}
            >
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Pridať záznam (napr. volal zákazník)…" />
              <IconButton label="Pridať" type="submit" className="border border-line">
                <Send className="size-4" />
              </IconButton>
            </form>
            <ol className="relative space-y-3 border-l border-line pl-4">
              {[...(repair.history ?? [])].reverse().map((h, i) => (
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
            <Button size="sm" variant="ghost" onClick={() => setDraft(toDraft(repair, settings.defaultWarrantyMonths))}>
              Zahodiť
            </Button>
            <Button size="sm" variant="primary" icon={<Save className="size-4" />} loading={saving} onClick={save}>
              Uložiť
            </Button>
          </div>
        </div>
      )}

      <HandoverDialog
        open={handover}
        onClose={() => setHandover(false)}
        repair={repair}
        amount={amount}
        onDone={() => {
          toast('Zariadenie vydané');
          print('vydajka');
        }}
        dirtySave={dirty ? save : undefined}
        defaultMonths={settings.defaultWarrantyMonths}
      />
      <EventDialog open={!!eventInit} init={eventInit} onClose={() => setEventInit(null)} />
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className={cx('tabular', strong && 'text-base font-bold')}>{value}</dd>
    </div>
  );
}

function HandoverDialog({
  open,
  onClose,
  repair,
  amount,
  onDone,
  dirtySave,
  defaultMonths,
}: {
  open: boolean;
  onClose: () => void;
  repair: Repair;
  amount: number;
  onDone: () => void;
  dirtySave?: () => Promise<void>;
  defaultMonths: number;
}) {
  const { run } = useFeedback();
  const [method, setMethod] = useState<PaymentMethod>('hotovost');
  const [paid, setPaid] = useState(true);
  const [busy, setBusy] = useState(false);
  const toPay = Math.max(0, amount - (repair.deposit || 0));
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Vydať zákazku ${repair.number}`}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Zrušiť</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              if (dirtySave) await dirtySave();
              const ok = await run(() =>
                updateRepair(repair, { status: 'vydane', paid: paid || repair.paid, paymentMethod: paid ? method : repair.paymentMethod ?? null }, `Vydané zákazníkovi${paid ? ` (${PAYMENT_METHODS.find((p) => p.id === method)?.label})` : ''}`),
              );
              setBusy(false);
              if (ok !== undefined) {
                onClose();
                onDone();
              }
            }}
          >
            Vydať
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-2xl bg-surface-2 p-4 text-center">
          <p className="text-sm text-muted">Na úhradu</p>
          <p className="text-3xl font-bold tabular">{fmtMoney(repair.paid ? 0 : toPay)}</p>
          {repair.deposit > 0 && <p className="text-xs text-muted">Celkom {fmtMoney(amount)}, záloha {fmtMoney(repair.deposit)}</p>}
        </div>
        {!repair.paid && (
          <>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="size-4 accent-[var(--primary)]" />
              Zákazník zaplatil
            </label>
            {paid && (
              <div className="grid grid-cols-3 gap-2">
                {PAYMENT_METHODS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setMethod(p.id)}
                    className={cx('rounded-xl border px-2 py-2.5 text-sm font-medium', method === p.id ? 'border-primary bg-primary-soft text-primary' : 'border-line')}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        <p className="text-xs text-muted">
          {repair.kind === 'reklamacia' ? 'Po vydaní sa otvorí doklad o vybavení reklamácie.' : `Po vydaní sa otvorí výdajka na tlač so zárukou ${warrantyLabel(repair, defaultMonths)}.`}
        </p>
      </div>
    </Modal>
  );
}
