import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { Plus, Search, Wrench } from 'lucide-react';
import { useData } from '@/features/data';
import { isRepairOpen, repairAmount } from '@/features/metrics';
import { Button, EmptyState, Input, PageHeader, Segmented, Select, cx } from '@/components/ui';
import { DueChip, RepairStatusBadge, isOverdue } from '@/components/domain';
import { useFeedback } from '@/components/feedback';
import { REPAIR_STATUSES, priority } from '@/lib/constants';
import { col, setRepairStatus } from '@/lib/db';
import { fmtDate, fmtMoney, fmtPhone, toDate } from '@/lib/format';
import { matches, searchToken } from '@/lib/keywords';
import { useDebounced, useIsDesktop } from '@/lib/hooks';
import type { Repair, RepairStatus } from '@/lib/types';

type Filter = 'aktivne' | RepairStatus | 'po_termine' | 'uzavrete' | 'vsetky';

export function RepairsPage() {
  const { repairs } = useData();
  const [params, setParams] = useSearchParams();
  const filter = (params.get('filter') as Filter) || 'aktivne';
  const [q, setQ] = useState(params.get('q') ?? '');
  const [sort, setSort] = useState<'termin' | 'najnovsie'>('termin');
  const [remote, setRemote] = useState<Repair[]>([]);
  const dq = useDebounced(q, 350);
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const { run } = useFeedback();

  useEffect(() => {
    const token = searchToken(dq);
    if (!token) return setRemote([]);
    let cancelled = false;
    getDocs(query(col.repairs(), where('keywords', 'array-contains', token), orderBy('createdAt', 'desc'), limit(50)))
      .then((snap) => !cancelled && setRemote(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Repair)))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [dq]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { aktivne: 0, po_termine: 0 };
    for (const r of repairs) {
      c[r.status] = (c[r.status] ?? 0) + 1;
      if (isRepairOpen(r)) c.aktivne++;
      if (isRepairOpen(r) && r.status !== 'hotove' && isOverdue(r.dueAt, true)) c.po_termine++;
    }
    return c;
  }, [repairs]);

  const list = useMemo(() => {
    const seen = new Set<string>();
    const source = [...repairs, ...remote].filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
    let out = source.filter((r) => {
      if (dq.trim()) return matches([r.number, r.customer?.name, r.customer?.phone, r.device.brand, r.device.model, r.device.imei, r.problem], dq);
      switch (filter) {
        case 'aktivne':
          return isRepairOpen(r);
        case 'po_termine':
          return isRepairOpen(r) && r.status !== 'hotove' && isOverdue(r.dueAt, true);
        case 'uzavrete':
          return !isRepairOpen(r);
        case 'vsetky':
          return true;
        default:
          return r.status === filter;
      }
    });
    out = [...out].sort((a, b) =>
      sort === 'termin' && !dq
        ? (toDate(a.dueAt)?.getTime() ?? Infinity) - (toDate(b.dueAt)?.getTime() ?? Infinity) || b.seq - a.seq
        : b.seq - a.seq,
    );
    return out;
  }, [repairs, remote, filter, dq, sort]);

  const setFilter = (f: Filter) => {
    const p = new URLSearchParams(params);
    p.set('filter', f);
    setParams(p, { replace: true });
  };

  const options: { id: Filter; label: string; count?: number }[] = [
    { id: 'aktivne', label: 'Aktívne', count: counts.aktivne },
    ...REPAIR_STATUSES.filter((s) => s.open).map((s) => ({ id: s.id as Filter, label: s.short, count: counts[s.id] ?? 0 })),
    { id: 'po_termine', label: 'Po termíne', count: counts.po_termine },
    { id: 'uzavrete', label: 'Uzavreté' },
    { id: 'vsetky', label: 'Všetky' },
  ];

  return (
    <div>
      <PageHeader
        title="Zákazky"
        subtitle="Servisné zákazky – prijatie, oprava a vydanie zariadení"
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => navigate('/zakazky/nova')}>
            Nová zákazka
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hľadať podľa čísla, mena, telefónu, IMEI, modelu…" className="pl-9" />
          </div>
          <Select value={sort} onChange={(e) => setSort(e.target.value as 'termin' | 'najnovsie')} className="w-auto" aria-label="Zoradenie">
            <option value="termin">Podľa termínu</option>
            <option value="najnovsie">Najnovšie</option>
          </Select>
        </div>
        {!dq && <Segmented value={filter} onChange={setFilter} options={options} />}
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface">
          <EmptyState
            icon={<Wrench />}
            title={dq ? 'Nič sa nenašlo' : 'Žiadne zákazky v tomto zozname'}
            text={dq ? 'Skúste iné slovo alebo časť telefónneho čísla.' : undefined}
            action={!dq && <Button variant="primary" onClick={() => navigate('/zakazky/nova')}>Nová zákazka</Button>}
          />
        </div>
      ) : isDesktop ? (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-surface-2 text-left text-xs font-semibold tracking-wide text-muted uppercase">
              <tr>
                <th className="px-4 py-2.5">Číslo</th>
                <th className="px-4 py-2.5">Zariadenie</th>
                <th className="px-4 py-2.5">Zákazník</th>
                <th className="px-4 py-2.5">Stav</th>
                <th className="px-4 py-2.5">Termín</th>
                <th className="px-4 py-2.5 text-right">Suma</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map((r) => {
                const pr = priority(r.priority);
                return (
                  <tr key={r.id} className="group cursor-pointer hover:bg-surface-2/60" onClick={() => navigate(`/zakazky/${r.id}`)}>
                    <td className="px-4 py-3 align-top">
                      <Link to={`/zakazky/${r.id}`} className="font-semibold text-primary tabular" onClick={(e) => e.stopPropagation()}>
                        {r.number}
                      </Link>
                      <div className="text-xs text-muted">{fmtDate(r.createdAt, 'd. M.')}</div>
                    </td>
                    <td className="max-w-xs px-4 py-3 align-top">
                      <div className="flex items-center gap-2 font-medium">
                        {(r.priority === 'vysoka' || r.priority === 'urgentna') && (
                          <span className={cx('size-2 shrink-0 rounded-full', r.priority === 'urgentna' ? 'bg-red-500' : 'bg-orange-500')} title={`Priorita: ${pr.label}`} />
                        )}
                        <span className="truncate">
                          {r.device.brand} {r.device.model}
                        </span>
                      </div>
                      <div className="truncate text-xs text-muted">{r.problem}</div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="font-medium">{r.customer.name}</div>
                      <div className="text-xs text-muted">{fmtPhone(r.customer.phone)}</div>
                    </td>
                    <td className="px-4 py-3 align-top" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={r.status}
                        onChange={(e) => run(() => setRepairStatus(r, e.target.value as RepairStatus), 'Stav zmenený')}
                        className="rounded-lg border border-transparent bg-transparent py-0.5 text-sm hover:border-line"
                        aria-label="Zmeniť stav"
                      >
                        {REPAIR_STATUSES.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      <div className="mt-1">
                        <RepairStatusBadge status={r.status} />
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <DueChip due={r.dueAt} open={isRepairOpen(r) && r.status !== 'hotove'} />
                    </td>
                    <td className="px-4 py-3 text-right align-top">
                      <div className="font-semibold tabular">{repairAmount(r) ? fmtMoney(repairAmount(r)) : '—'}</div>
                      {r.paid ? <div className="text-xs text-emerald-600">zaplatené</div> : r.deposit ? <div className="text-xs text-muted">záloha {fmtMoney(r.deposit)}</div> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((r) => (
            <Link key={r.id} to={`/zakazky/${r.id}`} className="block rounded-2xl border border-line bg-surface p-4 active:bg-surface-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-semibold text-primary tabular">{r.number}</span>
                <RepairStatusBadge status={r.status} />
              </div>
              <div className="font-semibold">
                {r.device.brand} {r.device.model}
              </div>
              <div className="truncate text-sm text-muted">{r.problem}</div>
              <div className="mt-2 flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{r.customer.name}</span>
                <span className="flex items-center gap-3">
                  <DueChip due={r.dueAt} open={isRepairOpen(r) && r.status !== 'hotove'} />
                  {repairAmount(r) ? <b className="tabular">{fmtMoney(repairAmount(r))}</b> : null}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
      <p className="mt-3 text-center text-xs text-subtle">
        Zobrazených {list.length}. Uzavreté zákazky staršie ako 4 mesiace sa zobrazia pri vyhľadávaní.
      </p>
    </div>
  );
}
