import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { endOfMonth, startOfMonth } from 'date-fns';
import { BatteryMedium, Clock, MapPin, PackagePlus, Plus, Search, Smartphone, TrendingUp, Warehouse, Wallet, Wrench } from 'lucide-react';
import { useData } from '@/features/data';
import { inRange } from '@/features/metrics';
import { Badge, Button, EmptyState, Input, PageHeader, StatCard, cx, toneDot } from '@/components/ui';
import { PHONE_STATUSES, phoneGrade, phoneStatus } from '@/lib/constants';
import { col } from '@/lib/db';
import { fmtMoney } from '@/lib/format';
import { matches, searchToken } from '@/lib/keywords';
import { useDebounced } from '@/lib/hooks';
import { daysInStock, isPhoneOpen, isStockPhone, phoneName, phoneProfit, repairCosts, totalCost } from '@/lib/phones';
import type { Phone, PhoneStatus } from '@/lib/types';

type Filter = 'sklad' | PhoneStatus | 'vsetky';
/** Po koľkých dňoch na sklade upozorniť (viazané peniaze). */
const SLOW_DAYS = 45;

export default function PhonesPage() {
  const { phones } = useData();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('sklad');
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 350);
  const [remote, setRemote] = useState<Phone[]>([]);

  useEffect(() => {
    const token = searchToken(dq);
    if (!token) return setRemote([]);
    let alive = true;
    getDocs(query(col.phones(), where('keywords', 'array-contains', token), orderBy('createdAt', 'desc'), limit(40)))
      .then((s) => alive && setRemote(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Phone)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [dq]);

  const stock = phones.filter(isPhoneOpen);
  const kpi = useMemo(() => {
    const now = new Date();
    const sold = phones.filter((p) => p.status === 'predane' && inRange(p.closedAt, startOfMonth(now), endOfMonth(now)));
    const withTarget = stock.filter((p) => p.targetPrice != null);
    return {
      stockValue: stock.reduce((s, p) => s + totalCost(p), 0),
      expectedRevenue: withTarget.reduce((s, p) => s + (p.targetPrice ?? 0), 0),
      expectedProfit: withTarget.reduce((s, p) => s + (phoneProfit(p) ?? 0), 0),
      displayed: stock.filter((p) => p.status === 'vystavene').length,
      repair: stock.filter((p) => p.status === 'na_repas').length,
      soldCount: sold.length,
      soldProfit: sold.reduce((s, p) => s + (phoneProfit(p) ?? 0), 0),
    };
  }, [phones, stock]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { sklad: stock.length };
    for (const p of phones) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [phones, stock.length]);

  const list = useMemo(() => {
    const all = [...new Map([...phones, ...remote].map((p) => [p.id, p])).values()];
    const order = PHONE_STATUSES.map((s) => s.id);
    return all
      .filter((p) => (dq.trim() ? matches([p.number, p.device.brand, p.device.model, p.device.storage, p.device.color, p.device.imei, p.device.serial, p.seller?.name, p.sale?.buyer?.name], dq) : true))
      .filter((p) => dq.trim() || filter === 'vsetky' || (filter === 'sklad' ? isPhoneOpen(p) : p.status === filter))
      .sort((a, b) => (isPhoneOpen(a) && isPhoneOpen(b) ? order.indexOf(a.status) - order.indexOf(b.status) || (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0) : (b.closedAt?.toMillis() ?? 0) - (a.closedAt?.toMillis() ?? 0)));
  }, [phones, remote, filter, dq]);

  return (
    <div>
      <PageHeader
        title="Telefóny"
        subtitle="Výkup, repas a predaj použitých zariadení"
        actions={
          <>
            <Button icon={<PackagePlus className="size-4" />} onClick={() => navigate('/telefony/vykup?rezim=sklad')}>
              Pridať vlastné
            </Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => navigate('/telefony/vykup')}>
              Nový výkup
            </Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Na sklade" value={stock.length} hint={`${kpi.displayed} vystavených · ${kpi.repair} na repas`} icon={<Warehouse className="size-4" />} tone="blue" onClick={() => setFilter('sklad')} />
        <StatCard label="Hodnota skladu" value={fmtMoney(kpi.stockValue)} hint="Výkup + náklady na repas" icon={<Wallet className="size-4" />} tone="orange" />
        <StatCard label="Očakávaný zisk" value={fmtMoney(kpi.expectedProfit)} hint={`Pri cieľových cenách (${fmtMoney(kpi.expectedRevenue)})`} icon={<TrendingUp className="size-4" />} tone="green" />
        <StatCard label="Predané tento mesiac" value={kpi.soldCount} hint={`Zisk ${fmtMoney(kpi.soldProfit)}`} icon={<Smartphone className="size-4" />} tone="violet" onClick={() => setFilter('predane')} />
      </div>

      <div className="mb-4 flex flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hľadať model, IMEI, číslo výkupu, predávajúceho…" className="pl-9" />
        </div>
        {!dq && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <Chip active={filter === 'sklad'} onClick={() => setFilter('sklad')} label="Na sklade" count={counts.sklad} />
            {PHONE_STATUSES.map((s) => (
              <Chip key={s.id} active={filter === s.id} onClick={() => setFilter(s.id)} label={s.short} count={counts[s.id] ?? 0} dot={toneDot[s.tone]} />
            ))}
            <Chip active={filter === 'vsetky'} onClick={() => setFilter('vsetky')} label="Všetky" />
          </div>
        )}
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface">
          <EmptyState
            icon={<Smartphone />}
            title={dq ? 'Nič sa nenašlo' : 'Žiadne telefóny v tomto zozname'}
            text="Vykúpený telefón zapíšete cez Nový výkup – vytlačí sa výkupný doklad a telefón sa zaradí na sklad. Zariadenie, ktoré už vlastníte, pridáte cez Pridať vlastné."
            action={<Button variant="primary" onClick={() => navigate('/telefony/vykup')}>Nový výkup</Button>}
          />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => (
            <PhoneCard key={p.id} p={p} />
          ))}
        </div>
      )}
      <p className="mt-3 text-center text-xs text-subtle">Predané telefóny staršie ako 4 mesiace sa zobrazia pri vyhľadávaní.</p>
    </div>
  );
}

function Chip({ active, onClick, label, count, dot }: { active: boolean; onClick: () => void; label: string; count?: number; dot?: string }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium whitespace-nowrap transition-colors',
        active ? 'border-fg bg-fg text-bg' : 'border-line bg-surface text-muted hover:text-fg',
      )}
    >
      {dot && <span className={cx('size-2 rounded-full', dot)} />}
      {label}
      {count !== undefined && <span className="tabular opacity-70">{count}</span>}
    </button>
  );
}

function PhoneCard({ p }: { p: Phone }) {
  const st = phoneStatus(p.status);
  const g = phoneGrade(p.grade);
  const profit = phoneProfit(p);
  const days = daysInStock(p);
  const open = isPhoneOpen(p);
  const tasksOpen = (p.tasks ?? []).filter((t) => !t.done);
  const photo = p.photos?.[0]?.url;
  return (
    <Link to={`/telefony/${p.id}`} className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-xs transition-colors hover:border-primary/40">
      <div className="flex gap-3 p-3.5">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-2 text-subtle">
          {photo ? <img src={photo} alt="" loading="lazy" className="size-full object-cover" /> : <Smartphone className="size-7" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-primary tabular">{p.number}</span>
            <Badge tone={st.tone}>{st.short}</Badge>
          </div>
          <p className="mt-0.5 truncate font-semibold">{phoneName(p)}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <span className={cx('rounded-md px-1.5 py-0.5 font-bold', g.tone === 'green' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : g.tone === 'blue' ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' : 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300')}>
              Stav {p.grade}
            </span>
            {p.device.color && <span>{p.device.color}</span>}
            {p.device.batteryHealth ? (
              <span className="flex items-center gap-0.5">
                <BatteryMedium className="size-3.5" />
                {p.device.batteryHealth} %
              </span>
            ) : null}
            {p.device.imei && <span className="tabular">…{p.device.imei.slice(-4)}</span>}
            {isStockPhone(p) && <span className="rounded-md bg-surface-2 px-1.5 py-0.5">vlastné</span>}
          </div>
        </div>
      </div>
      {tasksOpen.length > 0 && open && (
        <div className="mx-3.5 mb-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          <Wrench className="size-3.5 shrink-0" />
          <span className="truncate">{tasksOpen.map((t) => t.name).join(', ')}</span>
        </div>
      )}
      <div className="mt-auto grid grid-cols-3 border-t border-line text-center text-xs">
        <div className="px-2 py-2">
          <p className="text-muted">Náklady</p>
          <p className="font-semibold tabular">{fmtMoney(totalCost(p))}</p>
          {repairCosts(p) > 0 && <p className="text-[10px] text-subtle">repas {fmtMoney(repairCosts(p))}</p>}
        </div>
        <div className="border-x border-line px-2 py-2">
          <p className="text-muted">{p.sale ? 'Predané za' : 'Cieľová cena'}</p>
          <p className="font-semibold tabular">{p.sale ? fmtMoney(p.sale.price) : p.targetPrice != null ? fmtMoney(p.targetPrice) : '—'}</p>
        </div>
        <div className="px-2 py-2">
          <p className="text-muted">{p.sale ? 'Zisk' : 'Marža'}</p>
          <p className={cx('font-semibold tabular', profit != null && profit < 0 ? 'text-red-600' : 'text-emerald-600 dark:text-emerald-400')}>{profit != null ? fmtMoney(profit) : '—'}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-line px-3.5 py-2 text-xs text-muted">
        <span className={cx('flex items-center gap-1', open && days > SLOW_DAYS && 'font-semibold text-amber-700 dark:text-amber-300')}>
          <Clock className="size-3.5" />
          {open ? `${days} ${days === 1 ? 'deň' : days >= 2 && days <= 4 ? 'dni' : 'dní'} na sklade` : `na sklade ${days} d.`}
        </span>
        {p.location && open && (
          <span className="flex min-w-0 items-center gap-1">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">{p.location}</span>
          </span>
        )}
        {p.listed && open && <Badge tone="cyan" dot={false}>inzerované</Badge>}
      </div>
    </Link>
  );
}
