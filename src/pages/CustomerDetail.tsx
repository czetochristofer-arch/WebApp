import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { doc, orderBy, query, where } from 'firebase/firestore';
import { ArrowLeft, Mail, MapPin, Package, Pencil, Plus, Trash2, Wrench } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useLiveDoc, useLiveQuery } from '@/lib/hooks';
import { useAuth } from '@/features/auth';
import { repairAmount } from '@/features/metrics';
import { Avatar, Button, Card, EmptyState, IconButton, PageLoader, StatCard } from '@/components/ui';
import { ContactButtons, OrderStatusBadge, RepairStatusBadge } from '@/components/domain';
import { useFeedback } from '@/components/feedback';
import { col, deleteCustomer } from '@/lib/db';
import { fmtDate, fmtMoney, fmtPhone } from '@/lib/format';
import type { Customer, Order, Repair } from '@/lib/types';
import { CustomerDialog } from './Customers';

export function CustomerDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { isOwner } = useAuth();
  const { run, confirm } = useFeedback();
  const [editing, setEditing] = useState<Customer | null>(null);
  const customer = useLiveDoc<Customer>(doc(db, 'customers', id), id);
  const repairs = useLiveQuery<Repair>(() => query(col.repairs(), where('customerId', '==', id), orderBy('createdAt', 'desc')), `cr-${id}`);
  const orders = useLiveQuery<Order>(() => query(col.orders(), where('customerId', '==', id), orderBy('createdAt', 'desc')), `co-${id}`);

  const spent = useMemo(
    () =>
      repairs.data.filter((r) => r.status === 'vydane').reduce((s, r) => s + repairAmount(r), 0) +
      orders.data.filter((o) => o.status === 'vydana').reduce((s, o) => s + o.total, 0),
    [repairs.data, orders.data],
  );

  if (customer.loading) return <PageLoader />;
  const c = customer.data;
  if (!c)
    return (
      <div className="py-20 text-center">
        <p className="font-semibold">Zákazník sa nenašiel</p>
        <Link to="/zakaznici" className="text-sm text-primary">
          Späť
        </Link>
      </div>
    );

  const remove = async () => {
    if (await confirm({ title: `Vymazať zákazníka ${c.name}?`, message: 'Zákazky a objednávky zostanú zachované.', confirmLabel: 'Vymazať', danger: true })) {
      await run(() => deleteCustomer(c.id), 'Vymazané');
      navigate('/zakaznici', { replace: true });
    }
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start gap-3">
        <IconButton label="Späť" onClick={() => navigate(-1)} className="-ml-2">
          <ArrowLeft className="size-5" />
        </IconButton>
        <Avatar name={c.name} className="size-12 text-base" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{c.name}</h1>
          <p className="text-sm text-muted">{[c.company, fmtPhone(c.phone)].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" icon={<Pencil className="size-4" />} onClick={() => setEditing(c)}>
            Upraviť
          </Button>
          {isOwner && (
            <IconButton label="Vymazať" size="sm" onClick={remove}>
              <Trash2 className="size-4" />
            </IconButton>
          )}
        </div>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Zákazky" value={repairs.data.length} icon={<Wrench className="size-4" />} tone="orange" />
        <StatCard label="Objednávky" value={orders.data.length} icon={<Package className="size-4" />} tone="blue" />
        <StatCard label="Utratil spolu" value={fmtMoney(spent)} tone="green" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card
            title="Zákazky"
            icon={<Wrench className="size-4" />}
            bodyClass="p-0"
            actions={
              <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => navigate('/zakazky/nova', { state: { customer: c } })}>
                Nová
              </Button>
            }
          >
            {repairs.data.length === 0 ? (
              <EmptyState title="Žiadne zákazky" />
            ) : (
              <ul className="divide-y divide-line">
                {repairs.data.map((r) => (
                  <li key={r.id}>
                    <Link to={`/zakazky/${r.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/60">
                      <span className="w-16 font-semibold text-primary tabular">{r.number}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {r.device.brand} {r.device.model}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {fmtDate(r.createdAt)} · {r.problem}
                        </span>
                      </span>
                      <span className="text-sm font-semibold tabular">{repairAmount(r) ? fmtMoney(repairAmount(r)) : ''}</span>
                      <RepairStatusBadge status={r.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Objednávky" icon={<Package className="size-4" />} bodyClass="p-0">
            {orders.data.length === 0 ? (
              <EmptyState title="Žiadne objednávky" />
            ) : (
              <ul className="divide-y divide-line">
                {orders.data.map((o) => (
                  <li key={o.id}>
                    <Link to={`/objednavky/${o.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/60">
                      <span className="w-16 font-semibold text-primary tabular">{o.number}</span>
                      <span className="min-w-0 flex-1 truncate text-sm">{o.items.map((i) => i.name).join(', ')}</span>
                      <span className="text-sm font-semibold tabular">{fmtMoney(o.total)}</span>
                      <OrderStatusBadge status={o.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <Card title="Kontakt">
          <div className="space-y-3 text-sm">
            <ContactButtons phone={c.phone} />
            {c.email && (
              <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-primary">
                <Mail className="size-4" /> {c.email}
              </a>
            )}
            {c.address && (
              <p className="flex items-center gap-2 text-muted">
                <MapPin className="size-4" /> {c.address}
              </p>
            )}
            {(c.ico || c.dic) && (
              <p className="text-muted">
                {c.ico && <>IČO: {c.ico} </>}
                {c.dic && <>· DIČ: {c.dic}</>}
              </p>
            )}
            {c.note && <p className="rounded-xl bg-surface-2 p-3 whitespace-pre-wrap">{c.note}</p>}
          </div>
        </Card>
      </div>
      <CustomerDialog value={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
