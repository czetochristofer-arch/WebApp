import { useMemo, useState } from 'react';
import { query, Timestamp, where } from 'firebase/firestore';
import {
  differenceInCalendarDays,
  endOfMonth,
  endOfYear,
  format,
  startOfMonth,
  startOfYear,
  subMonths,
} from 'date-fns';
import { sk } from 'date-fns/locale';
import { BarChart3, Clock, Package, Table2, TrendingUp, Wrench } from 'lucide-react';
import { useData } from '@/features/data';
import { inRange, repairAmount } from '@/features/metrics';
import { Button, Card, EmptyState, Input, PageHeader, Segmented, StatCard, cx } from '@/components/ui';
import { col } from '@/lib/db';
import { PAYMENT_METHODS } from '@/lib/constants';
import { fmtMoney, round2, toDate } from '@/lib/format';
import { useLiveQuery } from '@/lib/hooks';
import type { Order, Repair } from '@/lib/types';

type Period = 'mesiac' | 'minuly' | 'rok' | '12m' | 'vlastne';

export default function StatsPage() {
  const { repairs: loadedRepairs, orders: loadedOrders } = useData();
  const [period, setPeriod] = useState<Period>('mesiac');
  const [custom, setCustom] = useState({ from: format(startOfMonth(new Date()), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') });

  const { from, to } = useMemo(() => {
    const now = new Date();
    switch (period) {
      case 'minuly':
        return { from: startOfMonth(subMonths(now, 1)), to: endOfMonth(subMonths(now, 1)) };
      case 'rok':
        return { from: startOfYear(now), to: endOfYear(now) };
      case '12m':
        return { from: startOfMonth(subMonths(now, 11)), to: endOfMonth(now) };
      case 'vlastne':
        return { from: new Date(custom.from + 'T00:00'), to: new Date(custom.to + 'T23:59') };
      default:
        return { from: startOfMonth(now), to: endOfMonth(now) };
    }
  }, [period, custom]);

  // Pre graf potrebujeme posledných 12 mesiacov; staršie uzavreté záznamy dotiahneme zo servera.
  const chartFrom = startOfMonth(subMonths(new Date(), 11));
  const since = from < chartFrom ? from : chartFrom;
  const sinceKey = format(since, 'yyyy-MM-dd');
  const closedRepairs = useLiveQuery<Repair>(() => query(col.repairs(), where('closedAt', '>=', Timestamp.fromDate(since))), `stats-r-${sinceKey}`);
  const closedOrders = useLiveQuery<Order>(() => query(col.orders(), where('closedAt', '>=', Timestamp.fromDate(since))), `stats-o-${sinceKey}`);
  const createdRepairs = useLiveQuery<Repair>(
    () => query(col.repairs(), where('createdAt', '>=', Timestamp.fromDate(from)), where('createdAt', '<=', Timestamp.fromDate(to))),
    `stats-c-${from.getTime()}-${to.getTime()}`,
  );

  const repairs = closedRepairs.data.length ? closedRepairs.data : loadedRepairs;
  const orders = closedOrders.data.length ? closedOrders.data : loadedOrders;

  const s = useMemo(() => {
    const rs = repairs.filter((r) => r.status === 'vydane' && inRange(r.closedAt, from, to));
    const os = orders.filter((o) => o.status === 'vydana' && inRange(o.closedAt, from, to));
    const repairRevenue = rs.reduce((a, r) => a + repairAmount(r), 0);
    const repairCost = rs.reduce((a, r) => a + (r.totalCost || 0), 0);
    const orderRevenue = os.reduce((a, o) => a + (o.total || 0), 0);
    const orderCost = os.reduce((a, o) => a + (o.totalCost || 0), 0);
    const revenue = repairRevenue + orderRevenue;
    const profit = revenue - repairCost - orderCost;
    const durations = rs.map((r) => differenceInCalendarDays(toDate(r.closedAt)!, toDate(r.createdAt)!)).filter((d) => d >= 0);

    const byItem = new Map<string, { count: number; revenue: number }>();
    for (const r of rs) {
      const names = r.items?.length ? r.items.filter((i) => i.kind !== 'diel').map((i) => i.name) : [r.problem.split(',')[0]];
      for (const n of names.length ? names : r.items.map((i) => i.name)) {
        const key = n.trim() || 'Iné';
        const cur = byItem.get(key) ?? { count: 0, revenue: 0 };
        cur.count++;
        cur.revenue += r.items?.length ? r.items.filter((i) => i.name === n).reduce((a, i) => a + i.qty * i.price, 0) : repairAmount(r);
        byItem.set(key, cur);
      }
    }
    const byBrand = new Map<string, number>();
    for (const r of rs) {
      const b = r.device.brand?.trim() || 'Neuvedené';
      byBrand.set(b, (byBrand.get(b) ?? 0) + 1);
    }
    const byPayment = new Map<string, number>();
    for (const x of [...rs.map((r) => ({ m: r.paymentMethod, v: repairAmount(r) })), ...os.map((o) => ({ m: o.paymentMethod, v: o.total }))]) {
      const label = PAYMENT_METHODS.find((p) => p.id === x.m)?.label ?? 'Neuvedené';
      byPayment.set(label, (byPayment.get(label) ?? 0) + x.v);
    }
    return {
      rs,
      os,
      revenue,
      profit,
      repairRevenue,
      orderRevenue,
      margin: revenue ? (profit / revenue) * 100 : 0,
      avgRepair: rs.length ? repairRevenue / rs.length : 0,
      avgDays: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
      topItems: [...byItem.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 8),
      topBrands: [...byBrand.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
      payments: [...byPayment.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [repairs, orders, from, to]);

  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const m = subMonths(startOfMonth(new Date()), 11 - i);
      const mEnd = endOfMonth(m);
      const rs = repairs.filter((r) => r.status === 'vydane' && inRange(r.closedAt, m, mEnd));
      const os = orders.filter((o) => o.status === 'vydana' && inRange(o.closedAt, m, mEnd));
      const revenue = rs.reduce((a, r) => a + repairAmount(r), 0) + os.reduce((a, o) => a + o.total, 0);
      const cost = rs.reduce((a, r) => a + (r.totalCost || 0), 0) + os.reduce((a, o) => a + (o.totalCost || 0), 0);
      return { label: format(m, 'LLL', { locale: sk }), full: format(m, 'LLLL yyyy', { locale: sk }), revenue: round2(revenue), cost: round2(cost), profit: round2(revenue - cost), count: rs.length + os.length };
    });
  }, [repairs, orders]);

  return (
    <div>
      <PageHeader title="Štatistiky" subtitle="Tržby, zisk a prehľad o zákazkách" />
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <Segmented
          value={period}
          onChange={setPeriod}
          options={[
            { id: 'mesiac', label: 'Tento mesiac' },
            { id: 'minuly', label: 'Minulý mesiac' },
            { id: 'rok', label: 'Tento rok' },
            { id: '12m', label: '12 mesiacov' },
            { id: 'vlastne', label: 'Vlastné' },
          ]}
        />
        {period === 'vlastne' && (
          <div className="flex gap-2">
            <Input type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} aria-label="Od" />
            <Input type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} aria-label="Do" />
          </div>
        )}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Tržby" value={fmtMoney(s.revenue)} hint={`Servis ${fmtMoney(s.repairRevenue)} · tovar ${fmtMoney(s.orderRevenue)}`} icon={<TrendingUp className="size-4" />} tone="green" />
        <StatCard label="Zisk" value={fmtMoney(s.profit)} hint={`Marža ${s.margin.toFixed(0)} %`} icon={<BarChart3 className="size-4" />} tone="orange" />
        <StatCard label="Vydané zákazky" value={s.rs.length} hint={`Priemer ${fmtMoney(s.avgRepair)} · prijatých ${createdRepairs.data.length}`} icon={<Wrench className="size-4" />} tone="blue" />
        <StatCard label="Priemerná doba opravy" value={`${s.avgDays.toFixed(1)} dňa`} hint={`Predané objednávky: ${s.os.length}`} icon={<Clock className="size-4" />} tone="violet" />
      </div>

      <Card title="Tržby a zisk za posledných 12 mesiacov" className="mb-5">
        <MonthlyChart data={months} />
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Najčastejšie opravy" bodyClass="pt-2">
          {s.topItems.length ? <HBars rows={s.topItems.map(([k, v]) => ({ label: k, value: v.count, text: `${v.count}×` }))} /> : <EmptyState title="Žiadne dáta" />}
        </Card>
        <Card title="Značky zariadení" bodyClass="pt-2">
          {s.topBrands.length ? <HBars rows={s.topBrands.map(([k, v]) => ({ label: k, value: v, text: `${v}×` }))} /> : <EmptyState title="Žiadne dáta" />}
        </Card>
        <Card title="Spôsob platby" bodyClass="pt-2" icon={<Package className="size-4" />}>
          {s.payments.length ? <HBars rows={s.payments.map(([k, v]) => ({ label: k, value: v, text: fmtMoney(v) }))} /> : <EmptyState title="Žiadne dáta" />}
        </Card>
      </div>
    </div>
  );
}

interface MonthRow {
  label: string;
  full: string;
  revenue: number;
  cost: number;
  profit: number;
  count: number;
}

function niceMax(v: number) {
  if (v <= 0) return 100;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * p;
}

/** Stĺpcový graf: náklady (spodok) + zisk (vrch) = tržby. Hodnota tržieb nad stĺpcom len pri najvyššom a aktuálnom mesiaci. */
function MonthlyChart({ data }: { data: MonthRow[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const max = niceMax(Math.max(...data.map((d) => d.revenue)));
  const W = 720;
  const H = 240;
  const padL = 48;
  const padB = 24;
  const padT = 20;
  const band = (W - padL) / data.length;
  const barW = Math.min(24, band * 0.6);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const maxIdx = data.reduce((best, d, i) => (d.revenue > data[best].revenue ? i : best), 0);
  const hasData = data.some((d) => d.revenue > 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-sm">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: 'var(--chart-2)' }} /> Zisk
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: 'var(--chart-1)' }} /> Náklady (nákup dielov a tovaru)
        </span>
        <span className="text-muted">Výška stĺpca = tržby</span>
        <Button size="sm" variant="ghost" className="ml-auto" icon={<Table2 className="size-4" />} onClick={() => setTable(!table)}>
          {table ? 'Graf' : 'Tabuľka'}
        </Button>
      </div>
      {!hasData && !table ? (
        <EmptyState title="Zatiaľ žiadne tržby" text="Graf sa naplní, keď začnete vydávať zákazky a objednávky." />
      ) : table ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted uppercase">
              <tr>
                <th className="py-2">Mesiac</th>
                <th className="py-2 text-right">Tržby</th>
                <th className="py-2 text-right">Náklady</th>
                <th className="py-2 text-right">Zisk</th>
                <th className="py-2 text-right">Počet</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line tabular">
              {data.map((d) => (
                <tr key={d.full}>
                  <td className="py-2 first-letter:uppercase">{d.full}</td>
                  <td className="py-2 text-right">{fmtMoney(d.revenue)}</td>
                  <td className="py-2 text-right">{fmtMoney(d.cost)}</td>
                  <td className="py-2 text-right">{fmtMoney(d.profit)}</td>
                  <td className="py-2 text-right">{d.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Tržby a zisk po mesiacoch">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth={1} />
                <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="fill-subtle text-[11px]">
                  {t >= 1000 ? `${(t / 1000).toLocaleString('sk-SK')} tis.` : Math.round(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx0 = padL + band * i + band / 2;
              const x = cx0 - barW / 2;
              const costH = Math.max(0, y(0) - y(Math.min(d.cost, d.revenue)));
              const profitH = Math.max(0, y(0) - y(d.revenue) - costH);
              const gap = costH > 0 && profitH > 0 ? 2 : 0;
              const r = 4;
              const showLabel = d.revenue > 0 && (i === maxIdx || i === data.length - 1);
              return (
                <g key={d.full} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                  <rect x={padL + band * i} y={padT} width={band} height={H - padT - padB} fill={hover === i ? 'var(--chart-grid)' : 'transparent'} opacity={0.5} />
                  {costH > 0 && <path d={roundedTop(x, y(0) - costH, barW, costH, profitH > 0 ? 0 : r)} fill="var(--chart-1)" />}
                  {profitH > 0 && <path d={roundedTop(x, y(d.revenue), barW, Math.max(0, profitH - gap), r)} fill="var(--chart-2)" />}
                  {showLabel && (
                    <text x={cx0} y={y(d.revenue) - 6} textAnchor="middle" className="fill-fg text-[11px] font-semibold">
                      {Math.round(d.revenue).toLocaleString('sk-SK')} €
                    </text>
                  )}
                  <text x={cx0} y={H - 6} textAnchor="middle" className={cx('text-[11px]', i === data.length - 1 ? 'fill-fg font-semibold' : 'fill-muted')}>
                    {d.label}
                  </text>
                </g>
              );
            })}
          </svg>
          {hover !== null && (
            <div
              className="pointer-events-none absolute top-0 z-10 w-44 rounded-xl border border-line bg-surface p-3 text-xs shadow-lg"
              style={{ left: `clamp(0px, calc(${((padL + band * hover + band / 2) / W) * 100}% - 88px), calc(100% - 176px))` }}
            >
              <p className="mb-1 font-semibold first-letter:uppercase">{data[hover].full}</p>
              <p className="flex justify-between">
                <span className="text-muted">Tržby</span> <b className="tabular">{fmtMoney(data[hover].revenue)}</b>
              </p>
              <p className="flex justify-between">
                <span className="flex items-center gap-1 text-muted">
                  <span className="size-2 rounded-sm" style={{ background: 'var(--chart-1)' }} />
                  Náklady
                </span>
                <span className="tabular">{fmtMoney(data[hover].cost)}</span>
              </p>
              <p className="flex justify-between">
                <span className="flex items-center gap-1 text-muted">
                  <span className="size-2 rounded-sm" style={{ background: 'var(--chart-2)' }} />
                  Zisk
                </span>
                <span className="tabular">{fmtMoney(data[hover].profit)}</span>
              </p>
              <p className="mt-1 text-muted">{data[hover].count} vydaných</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

/** Vodorovné pruhy – jedna séria, hodnota za koncom pruhu. */
function HBars({ rows }: { rows: { label: string; value: number; text: string }[] }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${r.text}`}>
          <div className="mb-1 flex justify-between gap-2 text-sm">
            <span className="truncate">{r.label}</span>
            <span className="font-semibold tabular">{r.text}</span>
          </div>
          <div className="h-2 rounded-full bg-surface-2">
            <div className="h-2 rounded-full" style={{ width: `${Math.max(3, (r.value / max) * 100)}%`, background: 'var(--chart-2)' }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
