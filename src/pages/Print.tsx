import { useEffect, useMemo, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { doc } from 'firebase/firestore';
import qrcode from 'qrcode-generator';
import { Printer, X } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useLiveDoc } from '@/lib/hooks';
import { useData } from '@/features/data';
import { receivedAt, repairAmount } from '@/features/metrics';
import { DEVICE_TYPES, paymentLabel, warrantyLabel, warrantyUntil } from '@/lib/constants';
import { repairQrUrl } from '@/lib/links';
import { fmtDate, fmtDateTime, fmtMoney, fmtPhone, toDate } from '@/lib/format';
import type { BusinessSettings, Repair } from '@/lib/types';
import { PageLoader } from '@/components/ui';

type Kind = 'protokol' | 'stitok' | 'vydajka';

export default function PrintPage() {
  const { kind = 'protokol', id = '' } = useParams<{ kind: Kind; id: string }>();
  const { settings, repairs } = useData();
  const cached = repairs.find((r) => r.id === id);
  const live = useLiveDoc<Repair>(cached ? null : doc(db, 'repairs', id), cached ? 'c' : id);
  const repair = cached ?? live.data;

  useEffect(() => {
    document.documentElement.classList.remove('dark');
    const style = document.createElement('style');
    style.textContent = kind === 'stitok' ? '@page { size: 62mm 29mm; margin: 0 }' : '@page { size: A4; margin: 12mm }';
    document.head.appendChild(style);
    return () => style.remove();
  }, [kind]);

  useEffect(() => {
    if (!repair) return;
    document.title = `${repair.number} – ${kind}`;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [repair, kind]);

  if (!repair) return live.loading ? <PageLoader /> : <p className="p-8">Zákazka sa nenašla.</p>;

  return (
    <div className="min-h-dvh bg-stone-100 text-black print:bg-white">
      <div className="no-print sticky top-0 z-10 flex items-center justify-center gap-2 border-b border-stone-200 bg-white p-3">
        <button onClick={() => window.print()} className="flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white">
          <Printer className="size-4" /> Tlačiť
        </button>
        <button onClick={() => window.close()} className="flex items-center gap-2 rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold">
          <X className="size-4" /> Zavrieť
        </button>
      </div>
      {kind === 'stitok' ? (
        <Label repair={repair} />
      ) : (
        <div className="mx-auto my-6 max-w-[210mm] bg-white p-[12mm] shadow print:m-0 print:max-w-none print:p-0 print:shadow-none">
          {kind === 'vydajka' ? <Handover repair={repair} s={settings} /> : <Intake repair={repair} s={settings} />}
        </div>
      )}
    </div>
  );
}

function Qr({ text, size = 88 }: { text: string; size?: number }) {
  const svg = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    return q.createSvgTag({ cellSize: 2, margin: 0, scalable: true });
  }, [text]);
  return <div style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

function Header({ s, title, number, date }: { s: BusinessSettings; title: string; number: string; date: string }) {
  return (
    <div className="flex items-start justify-between gap-6 border-b-2 border-black pb-3">
      <div className="text-[11px] leading-snug">
        <p className="text-lg font-bold">{s.legalName || s.name}</p>
        {s.address && <p>{s.address}</p>}
        <p>
          {s.ico && <>IČO: {s.ico} </>}
          {s.dic && <>· DIČ: {s.dic} </>}
          {s.vatPayer && s.icdph && <>· IČ DPH: {s.icdph}</>}
        </p>
        <p>{[s.phone && `tel. ${s.phone}`, s.email, s.web].filter(Boolean).join(' · ')}</p>
      </div>
      <div className="text-right">
        <p className="text-[11px] font-semibold tracking-wide uppercase">{title}</p>
        <p className="text-2xl font-bold tabular">{number}</p>
        <p className="text-[11px]">{date}</p>
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-4 break-inside-avoid">
      <p className="mb-1 text-[10px] font-bold tracking-wider text-stone-500 uppercase">{title}</p>
      <div className="text-[12px] leading-relaxed">{children}</div>
    </div>
  );
}

function KV({ k, v }: { k: string; v?: ReactNode }) {
  if (!v) return null;
  return (
    <p>
      <span className="text-stone-500">{k}: </span>
      <b>{v}</b>
    </p>
  );
}

function deviceLine(r: Repair) {
  const type = DEVICE_TYPES.find((t) => t.id === r.device.type)?.label;
  return `${r.device.brand} ${r.device.model}`.trim() + (type ? ` (${type.toLowerCase()})` : '');
}

function Intake({ repair: r, s }: { repair: Repair; s: BusinessSettings }) {
  return (
    <div>
      <Header s={s} title="Preberací protokol" number={r.number} date={`Prijaté ${fmtDateTime(receivedAt(r))}`} />
      <div className="grid grid-cols-[1fr_1fr_auto] gap-6">
        <Block title="Zákazník">
          <p className="font-bold">{r.customer.name}</p>
          {r.customer.phone && <p>{fmtPhone(r.customer.phone)}</p>}
          {r.customer.email && <p>{r.customer.email}</p>}
        </Block>
        <Block title="Zariadenie">
          <p className="font-bold">{deviceLine(r)}</p>
          <KV k="IMEI / SN" v={r.device.imei} />
          <KV k="Farba" v={r.device.color} />
          <KV k="Príslušenstvo" v={r.device.accessories || 'bez príslušenstva'} />
        </Block>
        <div className="mt-4 flex flex-col items-center gap-1">
          <Qr text={repairQrUrl(r.id)} size={80} />
          <p className="w-24 text-center text-[8.5px] leading-tight text-stone-500">Stav opravy online – naskenujte mobilom</p>
        </div>
      </div>
      <Block title="Popis poruchy">
        <p>{r.problem}</p>
      </Block>
      {r.device.condition && (
        <Block title="Stav zariadenia pri prevzatí">
          <p>{r.device.condition}</p>
        </Block>
      )}
      {r.notes && (
        <Block title="Poznámka">
          <p className="whitespace-pre-wrap">{r.notes}</p>
        </Block>
      )}
      <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg border border-stone-300 p-3 text-[12px]">
        <div>
          <p className="text-stone-500">Predbežná cena</p>
          <p className="text-base font-bold">{repairAmount(r) ? fmtMoney(repairAmount(r)) : 'po diagnostike'}</p>
        </div>
        <div>
          <p className="text-stone-500">Záloha</p>
          <p className="text-base font-bold">{fmtMoney(r.deposit)}</p>
        </div>
        <div>
          <p className="text-stone-500">Predpokladaný termín</p>
          <p className="text-base font-bold">{r.dueAt ? fmtDate(r.dueAt) : 'dohodou'}</p>
        </div>
      </div>
      <Block title="Podmienky servisu">
        <ol className="list-decimal space-y-0.5 pl-4 text-[10.5px] text-stone-700">
          {s.protocolTerms
            .split('\n')
            .filter((l) => l.trim())
            .map((l, i) => (
              <li key={i}>{l.replace(/^\d+[.)]\s*/, '')}</li>
            ))}
        </ol>
        <p className="mt-1 text-[10.5px] text-stone-700">Záručná doba na opravu a vymenené diely: {warrantyLabel(r, s.defaultWarrantyMonths)}.</p>
      </Block>
      <Signatures left="Prevzal za servis" right="Odovzdal zákazník (súhlasí s podmienkami)" />
      <p className="mt-6 text-center text-[9px] text-stone-500">Tento dokument nie je daňovým dokladom. Pri vyzdvihnutí predložte protokol alebo uveďte číslo zákazky {r.number}.</p>
    </div>
  );
}

function Handover({ repair: r, s }: { repair: Repair; s: BusinessSettings }) {
  const closed = toDate(r.closedAt) ?? new Date();
  const until = warrantyUntil(r, closed, s.defaultWarrantyMonths);
  const amount = repairAmount(r);
  return (
    <div>
      <Header s={s} title="Doklad o vydaní a záručný list" number={r.number} date={`Vydané ${fmtDateTime(closed)}`} />
      <div className="grid grid-cols-2 gap-6">
        <Block title="Zákazník">
          <p className="font-bold">{r.customer.name}</p>
          {r.customer.phone && <p>{fmtPhone(r.customer.phone)}</p>}
        </Block>
        <Block title="Zariadenie">
          <p className="font-bold">{deviceLine(r)}</p>
          <KV k="IMEI / SN" v={r.device.imei} />
          <KV k="Prijaté" v={fmtDate(receivedAt(r))} />
        </Block>
      </div>
      {r.diagnosis && (
        <Block title="Zistená porucha / vykonaná oprava">
          <p className="whitespace-pre-wrap">{r.diagnosis}</p>
        </Block>
      )}
      <Block title="Vykonané práce a použitý materiál">
        {r.items.length ? (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-stone-400 text-left text-[10px] text-stone-500 uppercase">
                <th className="py-1">Položka</th>
                <th className="py-1 text-right">Množstvo</th>
                <th className="py-1 text-right">Cena/ks</th>
                <th className="py-1 text-right">Spolu</th>
              </tr>
            </thead>
            <tbody>
              {r.items.map((i) => (
                <tr key={i.id} className="border-b border-stone-200">
                  <td className="py-1">{i.name}</td>
                  <td className="py-1 text-right tabular">{i.qty}</td>
                  <td className="py-1 text-right tabular">{fmtMoney(i.price)}</td>
                  <td className="py-1 text-right tabular">{fmtMoney(i.qty * i.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>{r.problem}</p>
        )}
      </Block>
      <div className="mt-4 ml-auto w-72 space-y-1 text-[12px]">
        <p className="flex justify-between">
          <span>Spolu</span> <b className="tabular">{fmtMoney(amount)}</b>
        </p>
        {r.deposit > 0 && (
          <p className="flex justify-between">
            <span>Uhradená záloha</span> <span className="tabular">−{fmtMoney(r.deposit)}</span>
          </p>
        )}
        <p className="flex justify-between border-t border-black pt-1 text-sm">
          <span className="font-bold">{r.paid ? 'Uhradené' : 'Na úhradu'}</span> <b className="tabular">{fmtMoney(Math.max(0, amount - r.deposit))}</b>
        </p>
        {r.paid && <p className="text-right text-stone-500">Spôsob platby: {paymentLabel(r.paymentMethod)}</p>}
        {!s.vatPayer && <p className="text-right text-[10px] text-stone-500">Nie sme platiteľmi DPH.</p>}
      </div>
      <div className="mt-5 rounded-lg border-2 border-black p-3 text-[12px]">
        <p className="font-bold">
          Záruka {warrantyLabel(r, s.defaultWarrantyMonths)} – platí do {fmtDate(until)}
        </p>
        <p className="mt-1 text-[10.5px] text-stone-700">
          Záruka sa vzťahuje na vykonanú opravu a vymenené diely. Nevzťahuje sa na mechanické poškodenie, poškodenie tekutinou, neodborný zásah ani bežné opotrebenie. Pri reklamácii
          predložte tento doklad.
        </p>
      </div>
      <Signatures left="Vydal za servis" right="Zariadenie prevzal zákazník" />
    </div>
  );
}

function Signatures({ left, right }: { left: string; right: string }) {
  return (
    <div className="mt-10 grid grid-cols-2 gap-16 text-center text-[11px]">
      <div className="border-t border-black pt-1">{left}</div>
      <div className="border-t border-black pt-1">{right}</div>
    </div>
  );
}

function Label({ repair: r }: { repair: Repair }) {
  return (
    <div className="mx-auto my-6 flex h-[29mm] w-[62mm] items-center gap-[2mm] overflow-hidden bg-white p-[1.5mm] shadow print:m-0 print:shadow-none">
      <Qr text={repairQrUrl(r.id)} size={92} />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="text-[15px] font-black tabular">{r.number}</p>
        <p className="truncate text-[9px] font-bold">{r.customer.name}</p>
        <p className="truncate text-[9px]">{fmtPhone(r.customer.phone)}</p>
        <p className="truncate text-[9px]">
          {r.device.brand} {r.device.model}
        </p>
        <p className="truncate text-[8px]">{r.problem}</p>
        <p className="text-[8px]">{fmtDate(r.createdAt)}</p>
      </div>
    </div>
  );
}
