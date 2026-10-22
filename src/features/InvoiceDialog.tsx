import { useEffect, useState } from 'react';
import { addDays } from 'date-fns';
import { Timestamp } from 'firebase/firestore';
import { AlertTriangle } from 'lucide-react';
import { Button, Input, Modal, Segmented, Textarea } from '@/components/ui';
import { useFeedback } from '@/components/feedback';
import { useData } from '@/features/data';
import { PAYMENT_METHODS } from '@/lib/constants';
import { fmtMoney, toDate, toDateInput } from '@/lib/format';
import { buyerFrom, invoiceLines, invoiceOutdated, issueInvoice, linesTotal, updateInvoice } from '@/lib/invoice';
import type { InvoiceBuyer, PaymentMethod, Repair } from '@/lib/types';

const fromInput = (v: string) => new Date(v + 'T12:00');

/** Vystavenie novej faktúry k zákazke alebo úprava údajov existujúcej (číslo sa nemení). */
export function InvoiceDialog({ open, onClose, repair, onIssued }: { open: boolean; onClose: () => void; repair: Repair; onIssued?: () => void }) {
  const { settings, customers } = useData();
  const { run, toast } = useFeedback();
  const inv = repair.invoice;
  const [buyer, setBuyer] = useState<InvoiceBuyer>({ name: '' });
  const [issued, setIssued] = useState('');
  const [supply, setSupply] = useState('');
  const [due, setDue] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('hotovost');
  const [note, setNote] = useState('');
  const [refresh, setRefresh] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const today = new Date();
    const m = inv?.paymentMethod ?? repair.paymentMethod ?? 'hotovost';
    setBuyer(inv?.buyer ?? buyerFrom(customers.find((c) => c.id === repair.customerId), repair.customer.name));
    setIssued(toDateInput(inv?.issuedAt ?? today));
    setSupply(toDateInput(inv?.supplyAt ?? toDate(repair.closedAt) ?? today));
    setDue(toDateInput(inv?.dueAt ?? (repair.paid || m !== 'prevod' ? today : addDays(today, settings.invoiceDueDays ?? 14))));
    setMethod(m);
    setNote(inv?.note ?? '');
    setRefresh(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const outdated = invoiceOutdated(repair);
  const lines = inv && !refresh ? inv.lines : invoiceLines(repair);
  const setB = (patch: Partial<InvoiceBuyer>) => setBuyer((b) => ({ ...b, ...patch }));
  const firmMissing = !settings.ico || !(settings.legalName || settings.name) || !settings.address;

  const submit = async () => {
    if (!buyer.name.trim() && !buyer.company?.trim()) return toast('Zadajte odberateľa (meno alebo firmu).', 'error');
    if (!issued || !supply || !due) return toast('Vyplňte dátumy.', 'error');
    setBusy(true);
    const ok = inv
      ? await run(
          () =>
            updateInvoice(
              repair,
              {
                buyer,
                issuedAt: Timestamp.fromDate(fromInput(issued)),
                supplyAt: Timestamp.fromDate(fromInput(supply)),
                dueAt: Timestamp.fromDate(fromInput(due)),
                paymentMethod: method,
                note,
              },
              refresh,
            ),
          'Faktúra upravená',
        )
      : await run(() => issueInvoice(repair.id, settings, { buyer, issuedAt: fromInput(issued), supplyAt: fromInput(supply), dueAt: fromInput(due), paymentMethod: method, note }));
    setBusy(false);
    if (ok !== undefined) {
      onClose();
      if (!inv) onIssued?.();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={inv ? `Faktúra ${inv.number}` : 'Vystaviť faktúru'}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Zrušiť</Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            {inv ? 'Uložiť zmeny' : 'Vystaviť faktúru'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {firmMissing && (
          <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Na faktúru doplňte v Nastaveniach obchodné meno, adresu, IČO, DIČ a údaj o zápise do registra.
          </p>
        )}
        <div>
          <p className="mb-2 text-[13px] font-semibold">Odberateľ</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Meno a priezvisko" value={buyer.name} onChange={(e) => setB({ name: e.target.value })} />
            <Input label="Firma (ak fakturujete firme)" value={buyer.company ?? ''} onChange={(e) => setB({ company: e.target.value })} />
            <Input label="Adresa" wrapClass="sm:col-span-2" value={buyer.address ?? ''} onChange={(e) => setB({ address: e.target.value })} placeholder="ulica a číslo, PSČ, obec" />
            <Input label="IČO" value={buyer.ico ?? ''} onChange={(e) => setB({ ico: e.target.value })} />
            <Input label="DIČ" value={buyer.dic ?? ''} onChange={(e) => setB({ dic: e.target.value })} />
            {settings.vatPayer && <Input label="IČ DPH" value={buyer.icdph ?? ''} onChange={(e) => setB({ icdph: e.target.value.toUpperCase() })} />}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="Dátum vystavenia" type="date" value={issued} onChange={(e) => setIssued(e.target.value)} />
          <Input label="Dátum dodania" type="date" value={supply} onChange={(e) => setSupply(e.target.value)} />
          <Input label="Dátum splatnosti" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-muted">Forma úhrady</p>
          <Segmented value={method} onChange={setMethod} options={PAYMENT_METHODS} size="sm" />
          {method !== 'prevod' && <p className="mt-1.5 text-xs text-muted">Úhradu zaevidujte v pokladnici (eKasa) ako úhradu faktúry č. {inv?.number ?? '(pridelí sa)'}.</p>}
        </div>
        <div className="rounded-xl border border-line text-sm">
          {lines.map((l, i) => (
            <div key={i} className="flex justify-between gap-3 border-b border-line px-3 py-1.5 last:border-0">
              <span className="min-w-0 truncate">
                {l.qty !== 1 && `${l.qty}× `}
                {l.name}
              </span>
              <span className="tabular">{fmtMoney(l.qty * l.price)}</span>
            </div>
          ))}
          <div className="flex justify-between bg-surface-2 px-3 py-1.5 font-semibold">
            <span>Spolu</span>
            <span className="tabular">{fmtMoney(linesTotal(lines))}</span>
          </div>
        </div>
        {inv && outdated && (
          <label className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
            <input type="checkbox" checked={refresh} onChange={(e) => setRefresh(e.target.checked)} className="mt-0.5 size-4 accent-[var(--primary)]" />
            <span>Položky alebo záloha zákazky sa od vystavenia zmenili. Prevziať aktuálne položky do faktúry?</span>
          </label>
        )}
        <Textarea label="Poznámka na faktúre" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        {!inv && <p className="text-xs text-muted">Číslo faktúry sa pridelí z radu {new Date(fromInput(issued || toDateInput(new Date()))).getFullYear()} a už sa nemení. Faktúra je zároveň dokladom o vydaní a záručným listom.</p>}
      </div>
    </Modal>
  );
}
