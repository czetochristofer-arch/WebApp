import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc } from 'firebase/firestore';
import { Printer, X } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useLiveDoc } from '@/lib/hooks';
import { useData } from '@/features/data';
import { DEVICE_TYPES, PHONE_CHECKS, paymentLabel, phoneGrade } from '@/lib/constants';
import { fmtDate, fmtDateTime, fmtMoney, fmtPhone } from '@/lib/format';
import { phoneName, saleWarrantyUntil } from '@/lib/phones';
import { amountInWords } from '@/lib/words';
import type { BusinessSettings, Phone } from '@/lib/types';
import { PageLoader } from '@/components/ui';
import { Block, Header, KV, Signatures } from './Print';

type Kind = 'vykup' | 'vpd' | 'cenovka' | 'predaj';

/** Obec z adresy firmy („Hlavná 409/51, 079 01 Veľké Kapušany“ → „Veľké Kapušany“) – miesto uzavretia zmluvy. */
const placeOf = (address?: string) => (address?.split(',').pop() ?? '').replace(/\d{3}\s?\d{2}/, '').trim();
const birth = (ymd?: string) => (ymd ? fmtDate(new Date(ymd + 'T12:00')) : '—');

export default function PhonePrintPage() {
  const { kind = 'vykup', id = '' } = useParams<{ kind: Kind; id: string }>();
  const { settings, phones } = useData();
  const cached = phones.find((p) => p.id === id);
  const live = useLiveDoc<Phone>(cached ? null : doc(db, 'phones', id), cached ? 'c' : id);
  const phone = cached ?? live.data;

  useEffect(() => {
    document.documentElement.classList.remove('dark');
    const style = document.createElement('style');
    style.textContent = kind === 'cenovka' ? '@page { size: 100mm 70mm; margin: 0 }' : '@page { size: A4; margin: 12mm }';
    document.head.appendChild(style);
    return () => style.remove();
  }, [kind]);

  useEffect(() => {
    if (!phone) return;
    document.title = `${phone.number} – ${kind}`;
    const t = setTimeout(() => window.print(), 500);
    return () => clearTimeout(t);
  }, [phone, kind]);

  if (!phone) return live.loading ? <PageLoader /> : <p className="p-8">Telefón sa nenašiel.</p>;

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
      {kind === 'cenovka' ? (
        <PriceTag p={phone} s={settings} />
      ) : (
        <div className="mx-auto my-6 max-w-[210mm] bg-white p-[12mm] shadow print:m-0 print:max-w-none print:p-0 print:shadow-none">
          {kind === 'vpd' ? <CashVoucher p={phone} s={settings} /> : kind === 'predaj' ? <SaleDoc p={phone} s={settings} /> : <PurchaseContract p={phone} s={settings} />}
        </div>
      )}
    </div>
  );
}

function deviceTitle(p: Phone) {
  const type = DEVICE_TYPES.find((t) => t.id === p.device.type)?.label;
  return `${phoneName(p)}${p.device.color ? `, ${p.device.color}` : ''}${type ? ` (${type.toLowerCase()})` : ''}`;
}

function Firm({ s }: { s: BusinessSettings }) {
  return (
    <>
      <p className="font-bold">{s.legalName || s.name}</p>
      {s.address && <p>so sídlom {s.address}</p>}
      <p>
        {s.ico && <>IČO: {s.ico} </>}
        {s.dic && <>· DIČ: {s.dic} </>}
        {s.vatPayer && s.icdph && <>· IČ DPH: {s.icdph}</>}
      </p>
    </>
  );
}

/** Výkupný doklad = kúpna zmluva (§ 588 a nasl. Občianskeho zákonníka) – podklad pre účtovníctvo. */
function PurchaseContract({ p, s }: { p: Phone; s: BusinessSettings }) {
  const g = phoneGrade(p.grade);
  const failed = PHONE_CHECKS.filter((c) => p.checks?.[c.id] === false);
  const tested = PHONE_CHECKS.filter((c) => p.checks?.[c.id] != null);
  const place = placeOf(s.address);
  return (
    <div>
      <Header s={s} title="Výkupný doklad – kúpna zmluva" number={p.number} date={`Dňa ${fmtDateTime(p.purchasedAt)}`} />
      <p className="mt-3 text-[11px] text-stone-600">uzatvorená podľa § 588 a nasl. zákona č. 40/1964 Zb. Občiansky zákonník medzi zmluvnými stranami:</p>
      <div className="grid grid-cols-2 gap-6">
        <Block title="Predávajúci">
          <p className="font-bold">{p.seller.name}</p>
          <KV k="Trvalé bydlisko" v={p.seller.address} />
          <KV k="Dátum narodenia" v={birth(p.seller.birthDate)} />
          <KV k="Číslo dokladu totožnosti" v={p.seller.idDocument} />
          <KV k="Telefón" v={fmtPhone(p.seller.phone)} />
        </Block>
        <Block title="Kupujúci">
          <Firm s={s} />
        </Block>
      </div>

      <Block title="Predmet kúpy">
        <table className="w-full text-[12px]">
          <tbody>
            <tr className="border-b border-stone-200">
              <td className="w-44 py-1 text-stone-500">Zariadenie</td>
              <td className="py-1 font-bold">{deviceTitle(p)}</td>
            </tr>
            {p.device.imei && (
              <tr className="border-b border-stone-200">
                <td className="py-1 text-stone-500">IMEI</td>
                <td className="py-1 font-bold tabular">
                  {p.device.imei}
                  {p.device.imei2 ? ` / ${p.device.imei2}` : ''}
                </td>
              </tr>
            )}
            {p.device.serial && (
              <tr className="border-b border-stone-200">
                <td className="py-1 text-stone-500">Sériové číslo</td>
                <td className="py-1 font-bold">{p.device.serial}</td>
              </tr>
            )}
            <tr className="border-b border-stone-200">
              <td className="py-1 text-stone-500">Stav (trieda)</td>
              <td className="py-1">
                <b>{g.label}</b> – {g.text.toLowerCase()}
                {p.device.batteryHealth ? `, kondícia batérie ${p.device.batteryHealth} %` : ''}
              </td>
            </tr>
            <tr className="border-b border-stone-200">
              <td className="py-1 text-stone-500">Príslušenstvo</td>
              <td className="py-1">{p.device.accessories || 'bez príslušenstva'}</td>
            </tr>
            <tr className="border-b border-stone-200 align-top">
              <td className="py-1 text-stone-500">Zistené vady</td>
              <td className="py-1 whitespace-pre-wrap">
                {p.defects || 'bez zjavných vád'}
                {failed.length > 0 && <span className="block">Nefunkčné: {failed.map((c) => c.label.toLowerCase()).join(', ')}.</span>}
              </td>
            </tr>
            {tested.length > 0 && (
              <tr className="align-top">
                <td className="py-1 text-stone-500">Kontrola pri výkupe</td>
                <td className="py-1 text-[11px]">{tested.map((c) => `${c.label} ${p.checks[c.id] ? '✓' : '✗'}`).join(' · ')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </Block>

      <div className="mt-4 rounded-lg border-2 border-black p-3 text-[12px]">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-[10px] font-bold tracking-wider text-stone-500 uppercase">Kúpna cena</span>
          <span className="text-xl font-bold tabular">{fmtMoney(p.purchasePrice)}</span>
        </div>
        <p>slovom: {amountInWords(p.purchasePrice)}</p>
        <p className="mt-1">
          Spôsob úhrady:{' '}
          <b>{p.purchasePayment === 'hotovost' ? 'v hotovosti pri podpise zmluvy' : `bezhotovostným prevodom na účet predávajúceho ${p.seller.iban ?? ''}`}</b>
        </p>
      </div>

      <Block title="Vyhlásenia zmluvných strán">
        <ol className="list-decimal space-y-0.5 pl-4 text-[10.5px] text-stone-800">
          <li>
            Predávajúci čestne vyhlasuje, že je výlučným vlastníkom predávanej veci, vec nie je predmetom záložného práva ani iného práva tretej osoby, nebola nadobudnutá trestnou
            činnosťou, nie je odcudzená ani zablokovaná (IMEI, účet iCloud / Google) a je oprávnený s ňou nakladať.
          </li>
          <li>Predávajúci vyhlasuje, že zo zariadenia odstránil svoje osobné údaje a odhlásil sa zo svojich účtov. Za údaje ponechané v zariadení kupujúci nezodpovedá.</li>
          <li>Kupujúci si vec pred podpisom prezrel a vyskúšal. Jej stav zodpovedá popisu vyššie, s ktorým bola dohodnutá kúpna cena.</li>
          <li>
            Vlastnícke právo k veci prechádza na kupujúceho zaplatením kúpnej ceny.
            {p.purchasePayment === 'hotovost' ? ' Predávajúci svojím podpisom potvrdzuje, že kúpnu cenu prevzal v plnej výške.' : ''}
          </li>
          <li>Ak sa preukáže, že vyhlásenie podľa bodu 1 je nepravdivé, je predávajúci povinný vrátiť kúpnu cenu a nahradiť kupujúcemu vzniknutú škodu.</li>
          <li>
            Osobné údaje predávajúceho kupujúci spracúva na účel uzavretia a plnenia tejto zmluvy a plnenia zákonných povinností (účtovníctvo, archivácia) v súlade s nariadením GDPR
            a zákonom č. 18/2018 Z. z.
          </li>
          <li>Zmluva je vyhotovená v dvoch rovnopisoch, každá zmluvná strana dostane jeden. Zmluvné strany vyhlasujú, že ju uzavreli slobodne a vážne, prečítali ju a súhlasia s ňou.</li>
        </ol>
      </Block>

      <p className="mt-5 text-[12px]">
        V {place || '…………………'} dňa {fmtDate(p.purchasedAt)}
      </p>
      <Signatures left={`Predávajúci – ${p.seller.name}`} right="Kupujúci – za firmu (pečiatka, podpis)" />
    </div>
  );
}

/** Výdavkový pokladničný doklad pri výplate kúpnej ceny v hotovosti. */
function CashVoucher({ p, s }: { p: Phone; s: BusinessSettings }) {
  const cell = 'border border-black px-2 py-1.5 align-top';
  return (
    <div className="text-[12px]">
      <div className="flex items-start justify-between gap-6 border-b-2 border-black pb-3">
        <div className="text-[11px] leading-snug">
          <Firm s={s} />
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold tracking-wide uppercase">Výdavkový pokladničný doklad</p>
          <p className="text-2xl font-bold tabular">č. {p.number}</p>
          <p className="text-[11px]">zo dňa {fmtDate(p.purchasedAt)}</p>
        </div>
      </div>
      <table className="mt-4 w-full border-collapse">
        <tbody>
          <tr>
            <td className={`${cell} w-44 text-stone-600`}>Vyplatené komu</td>
            <td className={cell}>
              <b>{p.seller.name}</b>, {p.seller.address}
              {p.seller.birthDate ? `, nar. ${birth(p.seller.birthDate)}` : ''}
            </td>
          </tr>
          <tr>
            <td className={`${cell} text-stone-600`}>Účel výplaty</td>
            <td className={cell}>
              Výkup použitého tovaru – {deviceTitle(p)}
              {p.device.imei ? `, IMEI ${p.device.imei}` : p.device.serial ? `, SN ${p.device.serial}` : ''}, podľa výkupného dokladu č. {p.number}
            </td>
          </tr>
          <tr>
            <td className={`${cell} text-stone-600`}>Suma</td>
            <td className={cell}>
              <b className="text-base tabular">{fmtMoney(p.purchasePrice)}</b>
              <span className="ml-2">slovom: {amountInWords(p.purchasePrice)}</span>
            </td>
          </tr>
          <tr>
            <td className={`${cell} text-stone-600`}>DPH</td>
            <td className={cell}>bez DPH – predávajúci je fyzická osoba nepodnikateľ</td>
          </tr>
          <tr>
            <td className={`${cell} text-stone-600`}>Účtovací predpis</td>
            <td className={cell}>
              <span className="inline-block w-48">MD: ……………………</span> D: ……………………
            </td>
          </tr>
        </tbody>
      </table>
      <div className="mt-12 grid grid-cols-3 gap-8 text-center text-[11px]">
        <div className="border-t border-black pt-1">Vyhotovil</div>
        <div className="border-t border-black pt-1">Schválil / vyplatil</div>
        <div className="border-t border-black pt-1">Prijal (predávajúci)</div>
      </div>
      <p className="mt-6 text-[10px] text-stone-500">Prijímateľ svojím podpisom potvrdzuje prevzatie uvedenej sumy v hotovosti.</p>
    </div>
  );
}

/** Doklad o predaji a záručný list použitého zariadenia. */
function SaleDoc({ p, s }: { p: Phone; s: BusinessSettings }) {
  const sale = p.sale;
  if (!sale) return <p>Telefón ešte nie je predaný.</p>;
  const g = phoneGrade(p.grade);
  return (
    <div>
      <Header s={s} title="Doklad o predaji a záručný list" number={p.number} date={`Predané ${fmtDateTime(sale.at)}`} />
      <div className="grid grid-cols-2 gap-6">
        <Block title="Predávajúci">
          <Firm s={s} />
          {s.phone && <p>tel. {s.phone}</p>}
        </Block>
        <Block title="Kupujúci">
          <p className="font-bold">{sale.buyer.name || '—'}</p>
          {sale.buyer.phone && <p>{fmtPhone(sale.buyer.phone)}</p>}
        </Block>
      </div>
      <Block title="Predaný tovar – použité zariadenie">
        <p className="font-bold">{deviceTitle(p)}</p>
        <KV k="IMEI" v={p.device.imei ? `${p.device.imei}${p.device.imei2 ? ` / ${p.device.imei2}` : ''}` : undefined} />
        <KV k="Sériové číslo" v={p.device.serial} />
        <KV k="Stav" v={`${g.label} – ${g.text.toLowerCase()}`} />
        <KV k="Kondícia batérie" v={p.device.batteryHealth ? `${p.device.batteryHealth} %` : undefined} />
        <KV k="Príslušenstvo" v={p.device.accessories} />
        {p.defects && <KV k="Známe vady (kupujúci bol upozornený)" v={p.defects} />}
      </Block>
      <div className="mt-4 ml-auto w-72 space-y-1 text-[12px]">
        <p className="flex justify-between border-t border-black pt-1 text-sm">
          <span className="font-bold">Cena</span> <b className="tabular">{fmtMoney(sale.price)}</b>
        </p>
        <p className="text-right text-stone-500">Spôsob platby: {paymentLabel(sale.paymentMethod)}</p>
        {s.vatPayer ? (
          <p className="text-right text-[10px] text-stone-500">Úprava zdaňovania prirážky – použitý tovar (§ 66 zákona o DPH).</p>
        ) : (
          <p className="text-right text-[10px] text-stone-500">Nie sme platiteľmi DPH.</p>
        )}
      </div>
      <div className="mt-5 rounded-lg border-2 border-black p-3 text-[12px]">
        <p className="font-bold">
          Záruka {sale.warrantyMonths} mesiacov – platí do {fmtDate(saleWarrantyUntil(p))}
        </p>
        <p className="mt-1 text-[10.5px] text-stone-700">
          Ide o použitý tovar; záručná doba bola dohodnutá na {sale.warrantyMonths} mesiacov. Záruka sa nevzťahuje na vady, na ktoré bol kupujúci pri predaji upozornený, na opotrebenie
          zodpovedajúce miere používania, mechanické poškodenie, poškodenie tekutinou ani neodborný zásah. Kondícia batérie sa bežným používaním znižuje. Pri reklamácii predložte tento
          doklad.
        </p>
      </div>
      <Signatures left="Predal za servis" right="Tovar prevzal kupujúci" />
    </div>
  );
}

/** Cenovka do vitríny. */
function PriceTag({ p, s }: { p: Phone; s: BusinessSettings }) {
  const g = phoneGrade(p.grade);
  return (
    <div className="mx-auto my-6 flex h-[70mm] w-[100mm] flex-col justify-between bg-white p-[5mm] shadow print:m-0 print:shadow-none">
      <div>
        <p className="text-[10px] font-semibold tracking-widest text-stone-500 uppercase">{s.name}</p>
        <p className="mt-0.5 text-[20px] leading-tight font-black">
          {p.device.brand} {p.device.model}
        </p>
        <p className="text-[13px] font-semibold">{[p.device.storage, p.device.color].filter(Boolean).join(' · ')}</p>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px]">
        <span>
          Stav <b>{p.grade}</b> – {g.label.split(' – ')[1]}
        </span>
        {p.device.batteryHealth ? (
          <span>
            Batéria <b>{p.device.batteryHealth} %</b>
          </span>
        ) : null}
        <span>
          Záruka <b>{s.phoneWarrantyMonths ?? 12} mesiacov</b>
        </span>
      </div>
      <div className="flex items-end justify-between">
        <span className="text-[9px] text-stone-500 tabular">{p.number}</span>
        <span className="text-[34px] leading-none font-black tabular">{p.targetPrice != null ? fmtMoney(p.targetPrice) : '— €'}</span>
      </div>
    </div>
  );
}
