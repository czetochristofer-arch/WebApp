import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { query, Timestamp, where } from 'firebase/firestore';
import { differenceInCalendarDays } from 'date-fns';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { claimDeadline, isRepairOpen } from '@/features/metrics';
import { Badge, Button, Card, Textarea, cx } from '@/components/ui';
import { RepairStatusBadge } from '@/components/domain';
import { useFeedback } from '@/components/feedback';
import { CLAIM_RESOLUTIONS, claimResolution } from '@/lib/constants';
import { col, updateRepair } from '@/lib/db';
import { fmtDate } from '@/lib/format';
import { useLiveQuery } from '@/lib/hooks';
import type { ClaimInfo, ClaimResolution, Repair } from '@/lib/types';

/** Koľko dní zostáva na vybavenie reklamácie. */
export function DeadlineChip({ r }: { r: Repair }) {
  if (!isRepairOpen(r)) return null;
  const deadline = claimDeadline(r);
  const left = differenceInCalendarDays(deadline, new Date());
  const tone = left < 0 ? 'red' : left <= 5 ? 'amber' : 'gray';
  return (
    <Badge tone={tone} dot={false}>
      {left < 0 ? `lehota uplynula ${fmtDate(deadline, 'd. M.')}` : left === 0 ? 'lehota končí dnes' : `vybaviť do ${fmtDate(deadline, 'd. M.')} (${left} d.)`}
    </Badge>
  );
}

const SOURCE: Record<ClaimInfo['source'], string> = { oprava: 'Oprava u nás', nakup: 'Tovar kúpený u nás', iny: 'Záznam mimo aplikácie' };

/** Údaje a výsledok reklamácie v detaile zákazky. */
export function ClaimPanel({ repair }: { repair: Repair }) {
  const c: ClaimInfo = repair.claim ?? { source: 'iny' };
  const { run } = useFeedback();
  const [resolution, setResolution] = useState<ClaimResolution | null>(c.resolution ?? null);
  const [note, setNote] = useState(c.resolutionNote ?? '');
  useEffect(() => {
    setResolution(c.resolution ?? null);
    setNote(c.resolutionNote ?? '');
  }, [c.resolution, c.resolutionNote]);
  const dirty = resolution !== (c.resolution ?? null) || note !== (c.resolutionNote ?? '');
  const original = c.originalId ? (c.source === 'nakup' ? `/objednavky/${c.originalId}` : `/zakazky/${c.originalId}`) : null;
  const requested = claimResolution(c.requested);

  const save = () =>
    run(
      () =>
        updateRepair(
          repair,
          { claim: { ...c, resolution, resolutionNote: note.trim(), resolvedAt: resolution ? (c.resolvedAt ?? Timestamp.now()) : null } },
          resolution !== (c.resolution ?? null) ? `Výsledok reklamácie: ${claimResolution(resolution)?.label ?? 'nezadaný'}` : undefined,
        ),
      'Výsledok reklamácie uložený',
    );

  return (
    <Card title="Reklamácia" icon={<ShieldAlert className="size-4" />} className="border-rose-200 dark:border-rose-500/30">
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Reklamuje</dt>
          <dd className="text-right font-medium">
            {SOURCE[c.source]}
            {c.originalNumber && (
              <>
                {' '}
                {original ? (
                  <Link to={original} className="text-primary hover:underline">
                    {c.originalNumber}
                  </Link>
                ) : (
                  c.originalNumber
                )}
              </>
            )}
          </dd>
        </div>
        {c.originalDate && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">{c.source === 'nakup' ? 'Predané' : 'Vydané'}</dt>
            <dd className="font-medium">{fmtDate(c.originalDate)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Záruka</dt>
          <dd>
            {c.warrantyUntil ? (
              <Badge tone={c.inWarranty === false ? 'amber' : 'green'} dot={false}>
                {c.inWarranty === false ? `skončila ${fmtDate(c.warrantyUntil)}` : `do ${fmtDate(c.warrantyUntil)}`}
              </Badge>
            ) : (
              <span className="text-muted">neuvedená</span>
            )}
          </dd>
        </div>
        {requested && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Zákazník požaduje</dt>
            <dd className="font-medium">{requested.short}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Lehota (30 dní)</dt>
          <dd>{isRepairOpen(repair) ? <DeadlineChip r={repair} /> : <span className="text-muted">uzavretá {fmtDate(repair.closedAt)}</span>}</dd>
        </div>
      </dl>

      <div className="mt-4 border-t border-line pt-4">
        <p className="mb-2 text-[13px] font-medium text-muted">Výsledok reklamácie</p>
        <div className="grid grid-cols-2 gap-2">
          {CLAIM_RESOLUTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setResolution(resolution === o.id ? null : o.id)}
              className={cx(
                'rounded-xl border px-2 py-2 text-left text-xs font-semibold transition-colors',
                resolution === o.id ? (o.id === 'zamietnuta' ? 'border-red-400 bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300' : 'border-emerald-400 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300') : 'border-line hover:border-primary/40',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        <Textarea
          className="mt-2"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={resolution === 'zamietnuta' ? 'Odôvodnenie zamietnutia (napr. mechanické poškodenie, zásah tretej osoby)…' : 'Ako bola reklamácia vybavená (tlačí sa na doklad)…'}
        />
        {dirty && (
          <Button size="sm" variant="primary" className="mt-2 w-full" onClick={save}>
            Uložiť výsledok
          </Button>
        )}
      </div>
    </Card>
  );
}

/** Pri vydanej zákazke: reklamácie k nej a tlačidlo na prijatie novej. */
export function LinkedClaims({ repair }: { repair: Repair }) {
  const navigate = useNavigate();
  const claims = useLiveQuery<Repair>(() => query(col.repairs(), where('claim.originalId', '==', repair.id)), `claims-of-${repair.id}`);
  return (
    <Card title="Reklamácie" icon={<ShieldCheck className="size-4" />}>
      {claims.data.length > 0 && (
        <ul className="mb-3 space-y-2">
          {claims.data.map((c) => (
            <li key={c.id}>
              <Link to={`/zakazky/${c.id}`} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm hover:bg-surface-2">
                <span className="font-semibold text-primary tabular">{c.number}</span>
                <span className="min-w-0 flex-1 truncate text-muted">{c.problem}</span>
                {claimResolution(c.claim?.resolution) ? <Badge tone={claimResolution(c.claim?.resolution)!.tone}>{claimResolution(c.claim?.resolution)!.short}</Badge> : <RepairStatusBadge status={c.status} />}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Button size="sm" className="w-full" icon={<ShieldAlert className="size-4" />} onClick={() => navigate(`/reklamacie/nova?zakazka=${repair.id}`)}>
        Prijať reklamáciu k tejto zákazke
      </Button>
    </Card>
  );
}
