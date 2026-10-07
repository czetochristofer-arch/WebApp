import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { Plus, Search, ShieldAlert, UserRound } from 'lucide-react';
import { useData } from '@/features/data';
import { claimDeadline, isClaim, isRepairOpen } from '@/features/metrics';
import { Badge, Button, EmptyState, Input, PageHeader, Segmented, cx } from '@/components/ui';
import { RepairStatusBadge } from '@/components/domain';
import { DeadlineChip } from '@/features/ClaimPanel';
import { claimResolution } from '@/lib/constants';
import { col } from '@/lib/db';
import { fmtDate } from '@/lib/format';
import { matches, searchToken } from '@/lib/keywords';
import { useDebounced } from '@/lib/hooks';
import type { Repair } from '@/lib/types';

type Filter = 'otvorene' | 'vybavene' | 'vsetky';

export default function ClaimsPage() {
  const { repairs } = useData();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('otvorene');
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 350);
  const [remote, setRemote] = useState<Repair[]>([]);

  useEffect(() => {
    const token = searchToken(dq);
    if (!token) return setRemote([]);
    let alive = true;
    getDocs(query(col.repairs(), where('keywords', 'array-contains', token), orderBy('createdAt', 'desc'), limit(50)))
      .then((s) => alive && setRemote(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Repair).filter(isClaim)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [dq]);

  const claims = useMemo(() => [...new Map([...repairs.filter(isClaim), ...remote].map((r) => [r.id, r])).values()], [repairs, remote]);
  const counts = { otvorene: claims.filter(isRepairOpen).length, vybavene: claims.filter((c) => !isRepairOpen(c)).length };
  const list = useMemo(
    () =>
      claims
        .filter((r) => (dq.trim() ? matches([r.number, r.customer?.name, r.customer?.phone, r.device.brand, r.device.model, r.device.imei, r.claim?.originalNumber], dq) : true))
        .filter((r) => dq.trim() || filter === 'vsetky' || (filter === 'otvorene' ? isRepairOpen(r) : !isRepairOpen(r)))
        .sort((a, b) => (isRepairOpen(a) && isRepairOpen(b) ? claimDeadline(a).getTime() - claimDeadline(b).getTime() : b.seq - a.seq)),
    [claims, filter, dq],
  );

  return (
    <div>
      <PageHeader
        title="Reklamácie"
        subtitle="Reklamácie opráv a tovaru kúpeného u nás · lehota na vybavenie 30 dní"
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => navigate('/reklamacie/nova')}>
            Prijať reklamáciu
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hľadať podľa čísla, mena, telefónu, IMEI, pôvodnej zákazky…" className="pl-9" />
        </div>
        {!dq && (
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { id: 'otvorene', label: 'Na vybavenie', count: counts.otvorene },
              { id: 'vybavene', label: 'Vybavené', count: counts.vybavene },
              { id: 'vsetky', label: 'Všetky' },
            ]}
          />
        )}
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface">
          <EmptyState
            icon={<ShieldAlert />}
            title={dq ? 'Nič sa nenašlo' : filter === 'otvorene' ? 'Žiadne reklamácie na vybavenie' : 'Žiadne reklamácie'}
            text="Reklamáciu prijmete k vydanej zákazke, k predanému tovaru alebo aj k záznamu z papierovej evidencie."
            action={<Button variant="primary" onClick={() => navigate('/reklamacie/nova')}>Prijať reklamáciu</Button>}
          />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((r) => (
            <ClaimCard key={r.id} r={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function ClaimCard({ r }: { r: Repair }) {
  const res = claimResolution(r.claim?.resolution);
  return (
    <Link to={`/zakazky/${r.id}`} className="flex flex-col rounded-2xl border border-l-4 border-line border-l-rose-500 bg-surface p-4 shadow-xs hover:border-primary/40">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="font-semibold text-primary tabular">{r.number}</span>
        {res ? <Badge tone={res.tone}>{res.short}</Badge> : <RepairStatusBadge status={r.status} />}
      </div>
      <p className="truncate font-semibold">
        {r.device.brand} {r.device.model}
      </p>
      <p className="truncate text-sm text-muted">{r.problem}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
        {r.claim?.originalNumber && <span className="rounded-md bg-surface-2 px-1.5 py-0.5">k {r.claim.originalNumber}</span>}
        <span className={cx('rounded-md px-1.5 py-0.5', r.claim?.inWarranty === false ? 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300' : 'bg-surface-2')}>
          {r.claim?.inWarranty === false ? 'po záruke' : r.claim?.warrantyUntil ? `záruka do ${fmtDate(r.claim.warrantyUntil, 'd. M. yyyy')}` : 'záruka neuvedená'}
        </span>
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-xs">
        <span className="flex min-w-0 items-center gap-1 text-muted">
          <UserRound className="size-3.5 shrink-0" />
          <span className="truncate">{r.customer.name}</span>
        </span>
        <DeadlineChip r={r} />
      </div>
    </Link>
  );
}
