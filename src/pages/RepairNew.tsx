import { useMemo, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera, PackageCheck, PackageOpen, Save } from 'lucide-react';
import { Timestamp } from 'firebase/firestore';
import { useData } from '@/features/data';
import { emptyRepair, RepairFormSections, type RepairDraft } from '@/features/RepairForm';
import { Button, Card, IconButton, PageHeader, cx } from '@/components/ui';
import { PhotoGallery } from '@/components/domain';
import { useFeedback } from '@/components/feedback';
import { createRepair, newRepairId } from '@/lib/db';

export function RepairNewPage() {
  const { settings } = useData();
  const navigate = useNavigate();
  const { run, toast } = useFeedback();
  const id = useMemo(() => newRepairId(), []);
  const location = useLocation();
  const [draft, setDraft] = useState<RepairDraft>(() => {
    const d = emptyRepair(settings.defaultWarrantyMonths);
    // Z detailu zákazníka sa dá prísť s predvyplneným zákazníkom.
    const c = (location.state as { customer?: { id: string; name: string; phone?: string; email?: string } } | null)?.customer;
    if (c) d.customer = { id: c.id, name: c.name, phone: c.phone, email: c.email };
    return d;
  });
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof RepairDraft>(k: K, v: RepairDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!draft.customer.name.trim()) return toast('Zadajte meno zákazníka.', 'error');
    if (!draft.device.brand.trim() && !draft.device.model.trim()) return toast('Zadajte značku alebo model zariadenia.', 'error');
    if (!draft.problem.trim()) return toast('Popíšte poruchu.', 'error');
    setSaving(true);
    const res = await run(() => createRepair(draft, settings.repairPrefix, id));
    setSaving(false);
    if (res) {
      toast(`Zákazka ${res.number} vytvorená`);
      navigate(`/zakazky/${res.id}?nova=1`, { replace: true });
    }
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl">
      <PageHeader
        title="Nová zákazka"
        subtitle="Prijatie zariadenia do servisu"
        back={
          <IconButton label="Späť" onClick={() => navigate(-1)} className="-ml-2">
            <ArrowLeft className="size-5" />
          </IconButton>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-2">
        {(
          [
            { id: 'prijate', icon: <PackageCheck className="size-5" />, title: 'Prijímam zariadenie', text: 'Zariadenie je v servise' },
            { id: 'oznamene', icon: <PackageOpen className="size-5" />, title: 'Zákazník ho prinesie', text: 'Oznámená oprava – zariadenie príde neskôr' },
          ] as const
        ).map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => {
              set('status', o.id);
              // Pri oznámenej oprave termín dokončenia ešte nepoznáme.
              if (o.id === 'oznamene' && draft.status !== 'oznamene') set('dueAt', null);
              if (o.id === 'prijate' && draft.status === 'oznamene' && !draft.dueAt) set('dueAt', emptyRepair(0).dueAt as Timestamp);
            }}
            className={cx(
              'flex items-start gap-3 rounded-2xl border p-3 text-left transition-colors',
              draft.status === o.id ? 'border-primary bg-primary-soft' : 'border-line bg-surface hover:border-primary/40',
            )}
          >
            <span className={cx('mt-0.5', draft.status === o.id ? 'text-primary' : 'text-muted')}>{o.icon}</span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{o.title}</span>
              <span className="block text-xs text-muted">{o.text}</span>
            </span>
          </button>
        ))}
      </div>
      <RepairFormSections draft={draft} set={set} compact />
      <div className="mt-4">
        <Card title="Fotky zariadenia" icon={<Camera className="size-4" />}>
          <PhotoGallery photos={draft.photos} folder={`repairs/${id}`} onChange={(photos) => set('photos', photos)} />
        </Card>
      </div>
      <div className="sticky bottom-20 z-10 mt-6 flex justify-end gap-2 rounded-2xl border border-line bg-surface/95 p-3 shadow-lg backdrop-blur lg:bottom-4">
        <Button onClick={() => navigate(-1)}>Zrušiť</Button>
        <Button type="submit" variant="primary" icon={<Save className="size-4" />} loading={saving}>
          Uložiť zákazku
        </Button>
      </div>
    </form>
  );
}
