import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, Users } from 'lucide-react';
import { useData } from '@/features/data';
import { Avatar, Button, EmptyState, Input, Modal, PageHeader, Textarea } from '@/components/ui';
import { useFeedback } from '@/components/feedback';
import { saveCustomer } from '@/lib/db';
import { fmtPhone } from '@/lib/format';
import { matches } from '@/lib/keywords';
import type { Customer } from '@/lib/types';

export function CustomersPage() {
  const { customers, repairs, orders } = useData();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Partial<Customer> | null>(null);

  useEffect(() => {
    if (params.get('novy')) {
      setEditing({});
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const activity = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of repairs) if (r.customerId) m.set(r.customerId, (m.get(r.customerId) ?? 0) + 1);
    for (const o of orders) if (o.customerId) m.set(o.customerId, (m.get(o.customerId) ?? 0) + 1);
    return m;
  }, [repairs, orders]);

  const list = useMemo(() => customers.filter((c) => matches([c.name, c.phone, c.email, c.company, c.ico], q)), [customers, q]);

  return (
    <div>
      <PageHeader
        title="Zákazníci"
        subtitle={`${customers.length} kontaktov`}
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing({})}>
            Nový zákazník
          </Button>
        }
      />
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hľadať meno, telefón, e-mail, firmu…" className="pl-9" />
      </div>
      {list.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface">
          <EmptyState icon={<Users />} title={q ? 'Nikto sa nenašiel' : 'Zatiaľ žiadni zákazníci'} text="Zákazníci sa pridávajú automaticky pri vytvorení zákazky alebo objednávky." />
        </div>
      ) : (
        <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {list.slice(0, 300).map((c) => (
            <Link key={c.id} to={`/zakaznici/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/60">
              <Avatar name={c.name} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {c.name}
                  {c.company && <span className="font-normal text-muted"> · {c.company}</span>}
                </div>
                <div className="truncate text-sm text-muted">{[fmtPhone(c.phone), c.email].filter(Boolean).join(' · ') || 'Bez kontaktu'}</div>
              </div>
              {!!activity.get(c.id) && <span className="text-xs text-muted">{activity.get(c.id)} záznamov</span>}
            </Link>
          ))}
        </div>
      )}
      <CustomerDialog value={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

export function CustomerDialog({ value, onClose }: { value: Partial<Customer> | null; onClose: () => void }) {
  const [draft, setDraft] = useState<Partial<Customer>>({});
  const [saving, setSaving] = useState(false);
  const { run } = useFeedback();
  const navigate = useNavigate();
  useEffect(() => {
    if (value) setDraft(value);
  }, [value]);
  const set = (k: keyof Customer, v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const save = async () => {
    if (!draft.name?.trim()) return;
    setSaving(true);
    const id = await run(() => saveCustomer(draft as Customer, draft.id), 'Zákazník uložený');
    setSaving(false);
    if (id) {
      onClose();
      if (!draft.id) navigate(`/zakaznici/${id}`);
    }
  };
  return (
    <Modal
      open={!!value}
      onClose={onClose}
      title={draft.id ? 'Upraviť zákazníka' : 'Nový zákazník'}
      footer={
        <>
          <Button onClick={onClose}>Zrušiť</Button>
          <Button variant="primary" onClick={save} loading={saving} disabled={!draft.name?.trim()}>
            Uložiť
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Meno a priezvisko" value={draft.name ?? ''} onChange={(e) => set('name', e.target.value)} autoFocus wrapClass="sm:col-span-2" />
        <Input label="Telefón" type="tel" value={draft.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
        <Input label="E-mail" type="email" value={draft.email ?? ''} onChange={(e) => set('email', e.target.value)} />
        <Input label="Firma" value={draft.company ?? ''} onChange={(e) => set('company', e.target.value)} />
        <Input label="IČO" value={draft.ico ?? ''} onChange={(e) => set('ico', e.target.value)} />
        <Input label="DIČ / IČ DPH" value={draft.dic ?? ''} onChange={(e) => set('dic', e.target.value)} />
        <Input label="Adresa" value={draft.address ?? ''} onChange={(e) => set('address', e.target.value)} />
        <Textarea label="Poznámka" value={draft.note ?? ''} onChange={(e) => set('note', e.target.value)} wrapClass="sm:col-span-2" rows={2} />
      </div>
    </Modal>
  );
}
