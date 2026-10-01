import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import {
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  Inbox,
  Mail,
  MapPin,
  MessageCircle,
  MessageCircleQuestion,
  MessageSquare,
  PackageOpen,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  Truck,
  Wrench,
  XCircle,
} from 'lucide-react';
import { functions } from '@/lib/firebase';
import { useAuth } from '@/features/auth';
import { REPAIR_STATUS_PUBLIC, repairStatus } from '@/lib/constants';
import { fmtDate, fmtMoney, fmtPhone, intlPhone } from '@/lib/format';
import { Spinner, cx, toneBg } from '@/components/ui';
import { Logo } from '@/components/Layout';
import type { RepairStatus } from '@/lib/types';

interface PublicRepair {
  number: string;
  status: RepairStatus;
  statusLabel: string;
  device: string;
  problem: string;
  customer: string | null;
  createdAt: string | null;
  receivedAt: string | null;
  dueAt: string | null;
  closedAt: string | null;
  updatedAt: string | null;
  amount: number;
  deposit: number;
  toPay: number;
  paid: boolean;
  items: { name: string; qty: number; price: number }[];
  warranty: string;
  warrantyUntil: string | null;
  business: { name: string; phone: string | null; email: string | null; address: string | null; web: string | null };
}

const STEPS = ['Prijaté', 'Diagnostika', 'Oprava', 'Hotové', 'Vydané'];
const STEP_OF: Record<RepairStatus, number> = {
  oznamene: -1,
  prijate: 0,
  diagnostika: 1,
  caka_schvalenie: 1,
  caka_diely: 2,
  v_oprave: 2,
  hotove: 3,
  vydane: 4,
  zrusene: -1,
};
const ICON: Record<RepairStatus, ReactNode> = {
  oznamene: <PackageOpen />,
  prijate: <Inbox />,
  diagnostika: <Search />,
  caka_schvalenie: <MessageCircleQuestion />,
  caka_diely: <Truck />,
  v_oprave: <Wrench />,
  hotove: <CheckCircle2 />,
  vydane: <ShieldCheck />,
  zrusene: <XCircle />,
};

const day = (iso: string | null) => (iso ? fmtDate(new Date(iso)) : null);

/** Stránka pre zákazníka: stav opravy bez prihlásenia (otvára sa z QR kódu alebo odkazu v SMS). */
export default function PublicStatusPage({ id }: { id: string }) {
  const { status: authStatus } = useAuth();
  const [data, setData] = useState<PublicRepair | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await httpsCallable<{ id: string }, PublicRepair>(functions, 'repairStatus')({ id });
      setData(res.data);
      setError(null);
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      setError(code.includes('not-found') || code.includes('invalid-argument') ? 'notfound' : 'offline');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
    // Stav sa obnoví, keď sa zákazník k stránke vráti.
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  useEffect(() => {
    if (data) document.title = `${data.number} – stav opravy · ${data.business.name}`;
  }, [data]);

  return (
    <div className="min-h-dvh bg-bg">
      <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pt-6 pb-8">
        <header className="mb-5 flex items-center gap-3">
          <Logo />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate font-bold tracking-tight">{data?.business.name ?? 'ChrisStop'}</p>
            <p className="text-xs text-muted">Servis mobilov a elektroniky</p>
          </div>
          {data?.business.phone && (
            <a href={`tel:+${intlPhone(data.business.phone)}`} className="flex size-10 items-center justify-center rounded-xl border border-line bg-surface text-primary" aria-label="Zavolať do servisu">
              <Phone className="size-5" />
            </a>
          )}
        </header>

        {authStatus === 'ready' && (
          <Link to={`/zakazky/${id}`} className="mb-4 flex items-center gap-2 rounded-2xl bg-primary-soft px-4 py-3 text-sm font-medium text-primary">
            <span className="flex-1">Takto stránku vidí zákazník. Otvoriť celú zákazku</span>
            <ArrowRight className="size-4" />
          </Link>
        )}

        {!data && loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner className="size-7" />
          </div>
        ) : !data ? (
          <div className="rounded-3xl border border-line bg-surface p-6 text-center">
            <p className="text-lg font-semibold">{error === 'notfound' ? 'Zákazka sa nenašla' : 'Stav sa nepodarilo načítať'}</p>
            <p className="mt-1 text-sm text-muted">
              {error === 'notfound' ? 'Odkaz je neplatný alebo zákazka už neexistuje. Kontaktujte, prosím, servis.' : 'Skontrolujte pripojenie na internet a skúste to znova.'}
            </p>
            {error !== 'notfound' && (
              <button onClick={load} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-fg">
                <RefreshCw className="size-4" /> Skúsiť znova
              </button>
            )}
          </div>
        ) : (
          <StatusView data={data} />
        )}

        <footer className="mt-auto pt-8 text-center text-xs text-subtle">
          {data && (
            <button onClick={load} className="mb-3 inline-flex items-center gap-1.5 text-muted hover:text-fg" disabled={loading}>
              <RefreshCw className={cx('size-3.5', loading && 'animate-spin')} />
              {data.updatedAt ? `Aktualizované ${fmtDate(new Date(data.updatedAt), 'd. M. yyyy HH:mm')}` : 'Obnoviť'}
            </button>
          )}
          {authStatus === 'signedOut' && (
            <p>
              <Link to="/" className="hover:text-fg">
                Prihlásenie pre servis
              </Link>
            </p>
          )}
        </footer>
      </div>
    </div>
  );
}

function StatusView({ data }: { data: PublicRepair }) {
  const tone = repairStatus(data.status).tone;
  const info = REPAIR_STATUS_PUBLIC[data.status] ?? { title: data.statusLabel, text: '' };
  const step = STEP_OF[data.status] ?? 0;
  const b = data.business;
  const phone = intlPhone(b.phone ?? '');
  const greeting = `Dobrý deň, píšem ohľadom zákazky ${data.number} (${data.device}).`;

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-3xl border border-line bg-surface shadow-sm">
        <div className="px-5 pt-5">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">
            Zákazka {data.number}
            {data.customer ? ` · ${data.customer}` : ''}
          </p>
          <h1 className="mt-1 text-xl font-bold tracking-tight">{data.device || 'Zariadenie'}</h1>
          {data.problem && <p className="mt-0.5 text-sm text-muted">{data.problem}</p>}
        </div>

        <div className={cx('mx-5 mt-4 flex items-start gap-3 rounded-2xl p-4', toneBg[tone])}>
          <span className="mt-0.5 shrink-0 [&>svg]:size-6">{ICON[data.status]}</span>
          <div className="min-w-0">
            <p className="font-bold">{info.title}</p>
            <p className="text-sm opacity-90">{info.text}</p>
          </div>
        </div>

        {data.status !== 'zrusene' && (
          <ol className="flex items-start px-5 pt-5 pb-1">
            {STEPS.map((label, i) => {
              const done = i < step || (i === step && (data.status === 'vydane' || data.status === 'hotove'));
              const current = i === step && !done;
              return (
                <li key={label} className="relative flex flex-1 flex-col items-center gap-1.5 text-center">
                  {i > 0 && <span className={cx('absolute top-3.5 right-1/2 h-0.5 w-full -translate-y-1/2', i <= step ? 'bg-primary' : 'bg-line')} />}
                  <span
                    className={cx(
                      'relative z-10 flex size-7 items-center justify-center rounded-full text-xs font-bold',
                      done ? 'bg-primary text-primary-fg' : current ? 'bg-surface text-primary ring-2 ring-primary' : 'bg-surface-2 text-subtle',
                    )}
                  >
                    {done ? <Check className="size-4" /> : i + 1}
                  </span>
                  <span className={cx('text-[11px] leading-tight', i <= step ? 'font-semibold text-fg' : 'text-subtle')}>{label}</span>
                </li>
              );
            })}
          </ol>
        )}

        <dl className="mt-4 divide-y divide-line border-t border-line text-sm">
          {data.receivedAt && <Row label="Prijaté do servisu" value={day(data.receivedAt)} />}
          {data.status !== 'vydane' && data.status !== 'zrusene' && data.dueAt && (
            <Row label={data.status === 'oznamene' ? 'Dohodnutý termín' : 'Predpokladané dokončenie'} value={day(data.dueAt)} icon={<CalendarClock className="size-4" />} />
          )}
          {data.status === 'vydane' && <Row label="Vydané" value={day(data.closedAt)} />}
          {data.amount > 0 && <Row label={data.items.length ? 'Cena opravy' : 'Predbežná cena'} value={fmtMoney(data.amount)} />}
          {data.deposit > 0 && <Row label="Zaplatená záloha" value={fmtMoney(data.deposit)} />}
          {data.amount > 0 && data.status !== 'zrusene' && (
            <Row label={data.paid ? 'Zaplatené' : 'Zostáva doplatiť'} value={data.paid ? 'áno' : fmtMoney(data.toPay)} strong />
          )}
          {data.status === 'vydane' && data.warrantyUntil ? (
            <Row label={`Záruka ${data.warranty}`} value={`do ${day(data.warrantyUntil)}`} icon={<ShieldCheck className="size-4 text-emerald-600" />} />
          ) : (
            data.status !== 'zrusene' && <Row label="Záruka na opravu a diely" value={data.warranty} />
          )}
        </dl>

        {data.items.length > 0 && (
          <div className="border-t border-line px-5 py-4">
            <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Položky opravy</p>
            <ul className="space-y-1 text-sm">
              {data.items.map((i, k) => (
                <li key={k} className="flex justify-between gap-3">
                  <span className="min-w-0">
                    {i.name}
                    {i.qty !== 1 && <span className="text-muted"> × {i.qty}</span>}
                  </span>
                  <span className="shrink-0 tabular">{fmtMoney(i.qty * i.price)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {(phone || b.email || b.address) && (
        <section className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
          <p className="font-semibold">{data.status === 'caka_schvalenie' ? 'Dajte nám vedieť' : 'Kontakt na servis'}</p>
          <p className="mt-0.5 text-sm text-muted">{b.name}</p>
          {phone && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <ContactLink href={`tel:+${phone}`} icon={<Phone className="size-5" />} label="Zavolať" primary />
              <ContactLink href={`sms:+${phone}?&body=${encodeURIComponent(greeting)}`} icon={<MessageSquare className="size-5" />} label="SMS" />
              <ContactLink href={`https://wa.me/${phone}?text=${encodeURIComponent(greeting)}`} icon={<MessageCircle className="size-5" />} label="WhatsApp" />
            </div>
          )}
          <ul className="mt-3 space-y-2 text-sm">
            {b.phone && (
              <li className="flex items-center gap-2 text-muted">
                <Phone className="size-4 shrink-0" /> {fmtPhone(b.phone)}
              </li>
            )}
            {b.email && (
              <li>
                <a href={`mailto:${b.email}?subject=${encodeURIComponent(`Zákazka ${data.number}`)}`} className="flex items-center gap-2 text-muted hover:text-fg">
                  <Mail className="size-4 shrink-0" /> {b.email}
                </a>
              </li>
            )}
            {b.address && (
              <li>
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address)}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-muted hover:text-fg">
                  <MapPin className="size-4 shrink-0" /> {b.address}
                </a>
              </li>
            )}
          </ul>
        </section>
      )}
    </div>
  );
}

function Row({ label, value, strong, icon }: { label: string; value: ReactNode; strong?: boolean; icon?: ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <dt className="flex items-center gap-2 text-muted">
        {icon}
        {label}
      </dt>
      <dd className={cx('text-right tabular', strong ? 'text-base font-bold' : 'font-medium')}>{value}</dd>
    </div>
  );
}

function ContactLink({ href, icon, label, primary }: { href: string; icon: ReactNode; label: string; primary?: boolean }) {
  return (
    <a
      href={href}
      target={href.startsWith('https') ? '_blank' : undefined}
      rel="noreferrer"
      className={cx(
        'flex flex-col items-center gap-1 rounded-2xl py-3 text-xs font-semibold',
        primary ? 'bg-primary text-primary-fg' : 'border border-line bg-surface hover:bg-surface-2',
      )}
    >
      {icon}
      {label}
    </a>
  );
}
