import { z } from 'zod';
import type { DocumentData, DocumentSnapshot } from 'firebase-admin/firestore';
import {
  db,
  ensureCustomer,
  FieldValue,
  history,
  newItemId,
  nextNumber,
  OPEN_ORDER,
  OPEN_REPAIR,
  ORDER_LABEL,
  ORDER_STATUSES,
  orderKeywords,
  customerKeywords,
  REPAIR_LABEL,
  REPAIR_STATUSES,
  repairKeywords,
  round2,
  Timestamp,
  totals,
  warrantyEndYmd,
  warrantyOf,
  warrantyText,
  DEFAULT_WARRANTY_MONTHS,
  type LineItem,
} from '../lib/store.js';
import { matches, searchToken } from '../lib/keywords.js';
import { endOfLocalDay, fmtLocal, localHm, localToDate, localYmd, startOfLocalDay } from '../lib/time.js';
import { buildKeywords } from '../lib/keywords.js';

export interface ToolContext {
  actor: string;
  settings: DocumentData;
  /** Adresa aplikácie (napr. https://chrisstop-app.web.app) – na odkazy pre zákazníkov. */
  appUrl?: string;
}

export interface ToolAction {
  label: string;
  link?: string;
  /** Pripravená správa pre zákazníka – v aplikácii sa zobrazia tlačidlá Zavolať / SMS / WhatsApp. */
  contact?: { phone: string; text: string };
}

export interface ToolOutcome {
  result: unknown;
  /** Odkaz, ktorý sa zobrazí v aplikácii (napr. „Zákazka Z-1042 vytvorená“). */
  action?: ToolAction;
}

interface ToolDef<S extends z.ZodType> {
  name: string;
  description: string;
  schema: S;
  label: (input: z.infer<S>) => string;
  run: (input: z.infer<S>, ctx: ToolContext) => Promise<ToolOutcome>;
}

function tool<S extends z.ZodType>(def: ToolDef<S>) {
  return def;
}

// ------------------------------------------------------------------ spoločné schémy

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'formát YYYY-MM-DD');
const hm = z.string().regex(/^\d{1,2}:\d{2}$/, 'formát HH:MM');
const money = z.number().min(0);
const repairStatus = z.enum(REPAIR_STATUSES);
const orderStatus = z.enum(ORDER_STATUSES);
const payment = z.enum(['hotovost', 'karta', 'prevod']);

const customerIn = z
  .object({
    id: z.string().optional().describe('ID existujúceho zákazníka, ak ho poznáš (z vyhľadávania).'),
    meno: z.string().describe('Meno a priezvisko zákazníka.'),
    telefon: z.string().optional(),
    email: z.string().optional(),
  })
  .describe('Zákazník. Ak zadáš telefón, existujúci zákazník s rovnakým číslom sa použije automaticky.');

const itemIn = z.object({
  nazov: z.string(),
  typ: z.enum(['praca', 'diel', 'tovar', 'ine']).optional().describe('praca = práca/servis, diel = náhradný diel, tovar = predaj tovaru'),
  pocet: z.number().positive().optional(),
  cena: money.describe('Predajná cena za kus v € (konečná cena pre zákazníka).'),
  nakup: money.optional().describe('Nákupná cena za kus v €, ak je známa.'),
  stav_dielu: z.enum(['treba_objednat', 'objednane', 'dorucene', 'na_sklade']).optional().describe('Len pre typ diel.'),
  dodavatel: z.string().optional(),
});

function toItem(i: z.infer<typeof itemIn>, defaultKind: LineItem['kind']): LineItem {
  const kind = i.typ ?? defaultKind;
  return {
    id: newItemId(),
    kind,
    name: i.nazov.trim(),
    qty: i.pocet ?? 1,
    price: i.cena,
    cost: i.nakup ?? 0,
    partStatus: kind === 'diel' ? i.stav_dielu ?? 'treba_objednat' : null,
    supplier: i.dodavatel ?? '',
  };
}

// ------------------------------------------------------------------ prevod dokumentov do stručnej podoby

const ts = (t: unknown) => (t instanceof Timestamp ? t.toDate() : null);
const repairSum = (r: DocumentData) => (r.items?.length ? r.total : r.estimate ?? 0);
const defaultMonths = (ctx: ToolContext) => Number(ctx.settings.defaultWarrantyMonths) || DEFAULT_WARRANTY_MONTHS;
const statusLink = (ctx: ToolContext, id: string) => (ctx.appUrl ? `${ctx.appUrl}/stav/${id}` : undefined);

function repairBrief(snap: DocumentSnapshot) {
  const r = snap.data()!;
  const due = ts(r.dueAt);
  return {
    id: snap.id,
    cislo: r.number,
    stav: r.status,
    stav_popis: REPAIR_LABEL[r.status] ?? r.status,
    zariadenie: `${r.device?.brand ?? ''} ${r.device?.model ?? ''}`.trim(),
    porucha: r.problem,
    zakaznik: r.customer?.name,
    telefon: r.customer?.phone || undefined,
    termin: due ? localYmd(due) : null,
    po_termine: !!due && OPEN_REPAIR.includes(r.status) && r.status !== 'hotove' && r.status !== 'oznamene' && localYmd(due) < localYmd(new Date()),
    suma: round2(repairSum(r)),
    zaplatene: !!r.paid,
    priorita: r.priority,
    typ: r.kind === 'reklamacia' ? 'reklamacia' : undefined,
    reklamacia_k: r.kind === 'reklamacia' ? (r.claim?.originalNumber ?? null) : undefined,
    vysledok_reklamacie: r.kind === 'reklamacia' ? (r.claim?.resolution ?? null) : undefined,
    zapisane: fmtLocal(ts(r.createdAt)),
    prijate: r.status === 'oznamene' ? null : fmtLocal(ts(r.receivedAt) ?? ts(r.createdAt)),
  };
}

function repairFull(snap: DocumentSnapshot, ctx: ToolContext) {
  const r = snap.data()!;
  const w = warrantyOf(r, defaultMonths(ctx));
  const closed = ts(r.closedAt);
  const warrantyTo = r.status === 'vydane' && closed ? warrantyEndYmd(w, closed) : null;
  return {
    ...repairBrief(snap),
    zakaznik: { id: r.customerId, meno: r.customer?.name, telefon: r.customer?.phone, email: r.customer?.email },
    zariadenie: {
      typ: r.device?.type,
      znacka: r.device?.brand,
      model: r.device?.model,
      imei: r.device?.imei,
      farba: r.device?.color,
      prislusenstvo: r.device?.accessories,
      stav_pri_prevzati: r.device?.condition,
      ma_zadany_kod: !!r.device?.passcode,
    },
    diagnostika: r.diagnosis,
    polozky: (r.items ?? []).map((i: LineItem) => ({ nazov: i.name, typ: i.kind, pocet: i.qty, cena: i.price, nakup: i.cost, stav_dielu: i.partStatus ?? undefined, dodavatel: i.supplier || undefined })),
    predbezna_cena: r.estimate,
    naklady: r.totalCost,
    zaloha: r.deposit,
    sposob_platby: r.paymentMethod,
    reklamacia:
      r.kind === 'reklamacia'
        ? {
            k_zakazke: r.claim?.originalNumber ?? null,
            zdroj: r.claim?.source,
            zaruka_do: ts(r.claim?.warrantyUntil) ? localYmd(ts(r.claim?.warrantyUntil)!) : null,
            v_zaruke: r.claim?.inWarranty ?? null,
            pozaduje: r.claim?.requested ?? null,
            vysledok: r.claim?.resolution ?? null,
            vysledok_poznamka: r.claim?.resolutionNote || undefined,
            lehota_do: localYmd(new Date(((ts(r.receivedAt) ?? ts(r.createdAt))?.getTime() ?? Date.now()) + 30 * 86400000)),
          }
        : undefined,
    zaruka: warrantyText(w),
    zaruka_do: warrantyTo,
    v_zaruke: warrantyTo ? warrantyTo >= localYmd(new Date()) : undefined,
    odkaz_pre_zakaznika: statusLink(ctx, snap.id),
    poznamka_pre_zakaznika: r.notes,
    interna_poznamka: r.internalNotes,
    pocet_fotiek: r.photos?.length ?? 0,
    uzavrete: fmtLocal(ts(r.closedAt), true),
    historia: (r.history ?? []).slice(-15).map((h: { at: Timestamp; by: string; text: string }) => `${fmtLocal(h.at.toDate(), true)} – ${h.text} (${h.by})`),
  };
}

function orderBrief(snap: DocumentSnapshot) {
  const o = snap.data()!;
  return {
    id: snap.id,
    cislo: o.number,
    stav: o.status,
    stav_popis: ORDER_LABEL[o.status] ?? o.status,
    polozky: (o.items ?? []).map((i: LineItem) => `${i.qty}× ${i.name} (${i.price} €)`),
    zakaznik: o.customer?.name,
    telefon: o.customer?.phone || undefined,
    dodavatel: o.supplier || undefined,
    suma: o.total,
    naklady: o.totalCost,
    zaloha: o.deposit,
    zaplatene: !!o.paid,
    ocakavane: ts(o.expectedAt) ? localYmd(ts(o.expectedAt)!) : null,
    vytvorene: fmtLocal(ts(o.createdAt)),
    poznamka: o.notes || undefined,
  };
}

function eventBrief(snap: DocumentSnapshot) {
  const e = snap.data()!;
  const start = ts(e.start)!;
  const end = ts(e.end)!;
  return {
    id: snap.id,
    nazov: e.title,
    typ: e.type,
    datum: localYmd(start),
    cas: e.allDay ? 'celý deň' : `${localHm(start)}–${localHm(end)}`,
    splnene: e.type === 'uloha' ? !!e.done : undefined,
    zakazka: e.repairNumber || undefined,
    poznamka: e.notes || undefined,
  };
}

// ------------------------------------------------------------------ vyhľadanie záznamu podľa čísla

async function findByNumber(collection: 'repairs' | 'orders' | 'phones', ref: string, prefix: string) {
  const col = db().collection(collection);
  const clean = ref.trim();
  const m = clean.match(/^([A-Za-z]*)[-\s]?(\d+)$/);
  if (m) {
    const number = `${(m[1] || prefix).toUpperCase()}-${m[2]}`;
    const q = await col.where('number', '==', number).limit(1).get();
    if (!q.empty) return q.docs[0];
    const q2 = await col.where('seq', '==', Number(m[2])).limit(1).get();
    if (!q2.empty) return q2.docs[0];
  }
  const snap = await col.doc(clean).get();
  return snap.exists ? snap : null;
}

async function textSearch(collection: string, q: string, fields: (d: DocumentData) => (string | undefined)[], limit = 10) {
  const token = searchToken(q);
  if (!token) return [];
  const snap = await db().collection(collection).where('keywords', 'array-contains', token).limit(60).get();
  return snap.docs.filter((d) => matches(fields(d.data()), q)).slice(0, limit);
}

const CLAIM_LABEL: Record<string, string> = { oprava: 'Uznaná – opravou', vymena: 'Uznaná – výmenou', vratenie: 'Uznaná – vrátením peňazí', zamietnuta: 'Zamietnutá' };
const PART_LABEL: Record<string, string> = { treba_objednat: 'treba objednať', objednane: 'objednané', dorucene: 'doručené', na_sklade: 'na sklade' };

const PHONE_STATUSES = ['na_repas', 'pripravene', 'vystavene', 'rezervovane', 'predane', 'vyradene'] as const;
const OPEN_PHONE = ['na_repas', 'pripravene', 'vystavene', 'rezervovane'];
const PHONE_LABEL: Record<string, string> = {
  na_repas: 'Čaká na repas / opravu',
  pripravene: 'Pripravené na predaj',
  vystavene: 'Vystavené v prevádzke',
  rezervovane: 'Rezervované',
  predane: 'Predané',
  vyradene: 'Na diely / vyradené',
};
const phoneCost = (p: DocumentData) => round2((p.purchasePrice || 0) + (p.costs ?? []).reduce((s: number, c: { amount?: number }) => s + (c.amount || 0), 0));

function phoneBrief(snap: DocumentSnapshot) {
  const p = snap.data()!;
  const cost = phoneCost(p);
  const price = p.sale?.price ?? p.targetPrice ?? null;
  const bought = ts(p.purchasedAt) ?? ts(p.createdAt);
  return {
    id: snap.id,
    cislo: p.number,
    telefon: [p.device?.brand, p.device?.model, p.device?.storage].filter(Boolean).join(' '),
    farba: p.device?.color || undefined,
    imei: p.device?.imei || undefined,
    stav: p.status,
    stav_popis: PHONE_LABEL[p.status] ?? p.status,
    trieda: p.grade,
    bateria: p.device?.batteryHealth ?? undefined,
    povod: p.origin === 'sklad' ? 'vlastné zariadenie pridané bez výkupu' : 'výkup od zákazníka',
    vykupna_cena: p.purchasePrice,
    naklady_repas: round2(cost - (p.purchasePrice || 0)),
    naklady_spolu: cost,
    cielova_cena: p.targetPrice ?? null,
    predajna_cena: p.sale?.price ?? undefined,
    zisk: price != null ? round2(price - cost) : null,
    ulohy_na_repas: (p.tasks ?? []).filter((t: { done: boolean }) => !t.done).map((t: { name: string }) => t.name),
    umiestnenie: p.location || undefined,
    vykupene: bought ? localYmd(bought) : null,
    dni_na_sklade: bought ? Math.floor(((ts(p.closedAt) ?? new Date()).getTime() - bought.getTime()) / 86400000) : null,
    rezervovane_pre: p.status === 'rezervovane' ? p.reservedFor || undefined : undefined,
  };
}

const notFound = (what: string) => ({ result: { chyba: `${what} sa nenašla. Skús vyhľadávanie.` } });

// ------------------------------------------------------------------ nástroje

export const TOOLS = [
  tool({
    name: 'prehlad_dna',
    description:
      'Prehľad aktuálnej situácie v servise: zákazky po termíne, hotové na vyzdvihnutie, diely na objednanie, čakajúce na schválenie, objednávky na objednanie a doručené, dnešný program a otvorené úlohy. Použi pri otázkach typu „čo mám dnes robiť“, „ako to vyzerá“.',
    schema: z.object({}),
    label: () => 'Prehľad dňa',
    run: async () => {
      const now = new Date();
      const today = localYmd(now);
      const [repairs, orders, events, tasks] = await Promise.all([
        db().collection('repairs').where('status', 'in', OPEN_REPAIR).get(),
        db().collection('orders').where('status', 'in', OPEN_ORDER).get(),
        db().collection('events').where('start', '>=', startOfLocalDay(today)).where('start', '<=', endOfLocalDay(today)).get(),
        db().collection('events').where('type', '==', 'uloha').where('done', '==', false).get(),
      ]);
      const rs = repairs.docs.map(repairBrief);
      const partsToOrder = repairs.docs
        .filter((d) => (d.data().items ?? []).some((i: LineItem) => i.kind === 'diel' && i.partStatus === 'treba_objednat'))
        .map((d) => ({ cislo: d.data().number, diely: d.data().items.filter((i: LineItem) => i.partStatus === 'treba_objednat').map((i: LineItem) => i.name) }));
      return {
        result: {
          dnes: today,
          rozpracovane_zakazky: rs.length,
          po_termine: rs.filter((r) => r.po_termine),
          termin_dnes: rs.filter((r) => r.termin === today && r.stav !== 'hotove'),
          hotove_na_vyzdvihnutie: rs.filter((r) => r.stav === 'hotove'),
          oznamene_cakame_na_zariadenie: rs.filter((r) => r.stav === 'oznamene'),
          caka_na_schvalenie: rs.filter((r) => r.stav === 'caka_schvalenie'),
          diely_na_objednanie: partsToOrder,
          objednavky_treba_objednat: orders.docs.filter((d) => d.data().status === 'nova').map(orderBrief),
          objednavky_dorucene: orders.docs.filter((d) => d.data().status === 'dorucena').map(orderBrief),
          dnesny_program: events.docs.filter((d) => d.data().type !== 'uloha').map(eventBrief),
          otvorene_ulohy: tasks.docs.map(eventBrief),
        },
      };
    },
  }),

  tool({
    name: 'hladaj',
    description: 'Fulltextové vyhľadávanie v zákazkách, objednávkach a zákazníkoch podľa mena, telefónu, čísla, IMEI, modelu zariadenia alebo názvu tovaru.',
    schema: z.object({ dotaz: z.string().min(2).describe('Hľadaný text, napr. „Novák“, „0905123“, „iPhone 13“, „Z-1042“.') }),
    label: (i) => `Hľadám „${i.dotaz}“`,
    run: async ({ dotaz }) => {
      const [repairs, orders, customers] = await Promise.all([
        textSearch('repairs', dotaz, (r) => [r.number, r.customer?.name, r.customer?.phone, r.device?.brand, r.device?.model, r.device?.imei, r.problem]),
        textSearch('orders', dotaz, (o) => [o.number, o.customer?.name, o.customer?.phone, o.supplier, ...(o.items ?? []).map((i: LineItem) => i.name)]),
        textSearch('customers', dotaz, (c) => [c.name, c.phone, c.email, c.company]),
      ]);
      return {
        result: {
          zakazky: repairs.map(repairBrief),
          objednavky: orders.map(orderBrief),
          zakaznici: customers.map((c) => ({ id: c.id, meno: c.data().name, telefon: c.data().phone, email: c.data().email || undefined, firma: c.data().company || undefined })),
        },
      };
    },
  }),

  tool({
    name: 'zoznam_zakaziek',
    description: 'Zoznam servisných zákaziek a reklamácií podľa filtra (typ, stav, termín, dátum prijatia, zákazník). Bez filtra vráti otvorené (nevydané) zákazky aj reklamácie.',
    schema: z.object({
      typ: z.enum(['oprava', 'reklamacia']).optional().describe('Len bežné zákazky alebo len reklamácie.'),
      stavy: z.array(repairStatus).optional().describe('Filtrovať podľa stavov.'),
      iba_po_termine: z.boolean().optional(),
      termin_od: ymd.optional(),
      termin_do: ymd.optional(),
      prijate_od: ymd.optional(),
      prijate_do: ymd.optional(),
      zakaznik_id: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    label: () => 'Načítavam zákazky',
    run: async (f) => {
      let q: FirebaseFirestore.Query = db().collection('repairs');
      if (f.zakaznik_id) q = q.where('customerId', '==', f.zakaznik_id);
      else if (f.prijate_od || f.prijate_do) {
        if (f.prijate_od) q = q.where('createdAt', '>=', startOfLocalDay(f.prijate_od));
        if (f.prijate_do) q = q.where('createdAt', '<=', endOfLocalDay(f.prijate_do));
      } else q = q.where('status', 'in', f.stavy?.length ? f.stavy : OPEN_REPAIR);
      const snap = await q.limit(500).get();
      let list = snap.docs.map(repairBrief);
      if (f.stavy?.length) list = list.filter((r) => f.stavy!.includes(r.stav as never));
      if (f.typ === 'reklamacia') list = list.filter((r) => r.typ === 'reklamacia');
      if (f.typ === 'oprava') list = list.filter((r) => r.typ !== 'reklamacia');
      if (f.iba_po_termine) list = list.filter((r) => r.po_termine);
      if (f.termin_od) list = list.filter((r) => r.termin && r.termin >= f.termin_od!);
      if (f.termin_do) list = list.filter((r) => r.termin && r.termin <= f.termin_do!);
      list.sort((a, b) => (a.termin ?? '9999').localeCompare(b.termin ?? '9999'));
      return { result: { pocet: list.length, zakazky: list.slice(0, f.limit ?? 40) } };
    },
  }),

  tool({
    name: 'detail_zakazky',
    description: 'Všetky údaje o jednej zákazke vrátane položiek, platby a histórie.',
    schema: z.object({ zakazka: z.string().describe('Číslo zákazky (napr. „Z-1042“ alebo „1042“) alebo jej ID.') }),
    label: (i) => `Otváram zákazku ${i.zakazka}`,
    run: async ({ zakazka }, ctx) => {
      const snap = await findByNumber('repairs', zakazka, ctx.settings.repairPrefix);
      if (!snap) return notFound('Zákazka');
      return { result: repairFull(snap, ctx), action: { label: `Zákazka ${snap.data()!.number}`, link: `/zakazky/${snap.id}` } };
    },
  }),

  tool({
    name: 'vytvor_zakazku',
    description:
      'Vytvorí novú servisnú zákazku (prijatie zariadenia do opravy). Zákazník sa automaticky priradí alebo vytvorí. Ak zákazník opravu len ohlásil (telefonicky, správou) a zariadenie prinesie neskôr, nastav oznamene=true.',
    schema: z.object({
      oznamene: z.boolean().optional().describe('true = zariadenie ešte nie je v servise, zákazník ho prinesie neskôr (stav „Oznámené“).'),
      zakaznik: customerIn,
      zariadenie: z.object({
        typ: z.enum(['mobil', 'tablet', 'notebook', 'hodinky', 'konzola', 'ine']).optional(),
        znacka: z.string().describe('napr. Apple, Samsung'),
        model: z.string().describe('napr. iPhone 13 Pro'),
        imei: z.string().optional(),
        farba: z.string().optional(),
        prislusenstvo: z.string().optional(),
        stav_pri_prevzati: z.string().optional(),
      }),
      porucha: z.string().describe('Popis poruchy od zákazníka.'),
      predbezna_cena: money.optional(),
      zaloha: money.optional(),
      termin: ymd.optional().describe('Termín dokončenia (pri oznámenej oprave dohodnutý deň, kedy zariadenie prinesie). Ak nie je povedaný, nechaj prázdne – pri prijatom zariadení sa nastaví o 2 dni.'),
      zaruka_mesiace: z.number().int().min(0).max(60).optional().describe('Len ak používateľ chce inú než štandardnú záruku.'),
      priorita: z.enum(['nizka', 'normalna', 'vysoka', 'urgentna']).optional(),
      polozky: z.array(itemIn).optional().describe('Práca a diely, ak sú už známe.'),
      poznamka_pre_zakaznika: z.string().optional(),
      interna_poznamka: z.string().optional(),
    }),
    label: (i) => `Vytváram zákazku – ${i.zariadenie.znacka} ${i.zariadenie.model}`,
    run: async (i, ctx) => {
      const customer = await ensureCustomer({ id: i.zakaznik.id, name: i.zakaznik.meno, phone: i.zakaznik.telefon, email: i.zakaznik.email });
      const { seq, number } = await nextNumber('repairs', ctx.settings.repairPrefix);
      const items = (i.polozky ?? []).map((x) => toItem(x, 'praca'));
      const due = i.termin ? endOfLocalDay(i.termin) : i.oznamene ? null : endOfLocalDay(localYmd(new Date(Date.now() + 2 * 86400000)));
      const device = {
        type: i.zariadenie.typ ?? 'mobil',
        brand: i.zariadenie.znacka,
        model: i.zariadenie.model,
        imei: i.zariadenie.imei ?? '',
        color: i.zariadenie.farba ?? '',
        passcode: '',
        accessories: i.zariadenie.prislusenstvo ?? '',
        condition: i.zariadenie.stav_pri_prevzati ?? '',
      };
      const data = {
        number,
        seq,
        status: i.oznamene ? 'oznamene' : 'prijate',
        priority: i.priorita ?? 'normalna',
        customerId: customer.id,
        customer,
        device,
        problem: i.porucha,
        diagnosis: '',
        items,
        ...totals(items),
        estimate: i.predbezna_cena ?? null,
        deposit: i.zaloha ?? 0,
        paid: false,
        paymentMethod: null,
        paidAt: null,
        warrantyMonths: i.zaruka_mesiace ?? defaultMonths(ctx),
        dueAt: due ? Timestamp.fromDate(due) : null,
        notes: i.poznamka_pre_zakaznika ?? '',
        internalNotes: i.interna_poznamka ?? '',
        photos: [],
        keywords: repairKeywords({ number, customer, device }),
        history: [history(ctx.actor, 'Zákazka vytvorená AI asistentom')],
        createdBy: ctx.actor,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        closedAt: null,
      };
      const ref = await db().collection('repairs').add(data);
      return {
        result: { ok: true, id: ref.id, cislo: number, stav: data.status, zakaznik: customer.name, termin: due ? localYmd(due) : null, odkaz_pre_zakaznika: statusLink(ctx, ref.id) },
        action: { label: `Vytvorená zákazka ${number}`, link: `/zakazky/${ref.id}` },
      };
    },
  }),

  tool({
    name: 'uprav_zakazku',
    description:
      'Upraví existujúcu zákazku: zmena stavu, diagnostika, pridanie položiek (práca/diely), stav dielov, cena, záloha, termín, priorita, poznámky, platba. Pri vydaní zákazníkovi nastav stav „vydane“ a zaplatene=true so spôsobom platby.',
    schema: z.object({
      zakazka: z.string().describe('Číslo zákazky alebo ID.'),
      stav: repairStatus.optional(),
      diagnostika: z.string().optional(),
      pridaj_polozky: z.array(itemIn).optional(),
      nastav_stav_dielu: z
        .array(z.object({ nazov: z.string(), stav: z.enum(['treba_objednat', 'objednane', 'dorucene', 'na_sklade']) }))
        .optional()
        .describe('Zmena stavu existujúcich dielov podľa názvu (stačí časť názvu).'),
      predbezna_cena: money.optional(),
      zaloha: money.optional(),
      termin: ymd.optional(),
      priorita: z.enum(['nizka', 'normalna', 'vysoka', 'urgentna']).optional(),
      zaruka_mesiace: z.number().int().min(0).max(60).optional(),
      vysledok_reklamacie: z.enum(['oprava', 'vymena', 'vratenie', 'zamietnuta']).optional().describe('Len pri reklamácii: spôsob vybavenia.'),
      vysledok_poznamka: z.string().optional().describe('Pri reklamácii: ako bola vybavená / odôvodnenie zamietnutia (tlačí sa na doklad).'),
      poznamka_pre_zakaznika: z.string().optional(),
      interna_poznamka: z.string().optional(),
      zaplatene: z.boolean().optional(),
      sposob_platby: payment.optional(),
      zaznam_do_historie: z.string().optional().describe('Krátky záznam do histórie, napr. „Zákazník telefonicky schválil cenu“.'),
    }),
    label: (i) => `Upravujem zákazku ${i.zakazka}`,
    run: async (i, ctx) => {
      const snap = await findByNumber('repairs', i.zakazka, ctx.settings.repairPrefix);
      if (!snap) return notFound('Zákazka');
      const r = snap.data()!;
      const update: DocumentData = { updatedAt: FieldValue.serverTimestamp() };
      const notes: string[] = [];
      let items: LineItem[] = r.items ?? [];
      if (i.pridaj_polozky?.length) {
        items = [...items, ...i.pridaj_polozky.map((x) => toItem(x, 'praca'))];
        notes.push(`Pridané položky: ${i.pridaj_polozky.map((x) => x.nazov).join(', ')}`);
      }
      if (i.nastav_stav_dielu?.length) {
        items = items.map((it) => {
          const hit = i.nastav_stav_dielu!.find((p) => it.name.toLowerCase().includes(p.nazov.toLowerCase()));
          return hit ? { ...it, partStatus: hit.stav } : it;
        });
        notes.push(`Stav dielov: ${i.nastav_stav_dielu.map((p) => `${p.nazov} → ${p.stav}`).join(', ')}`);
      }
      if (i.pridaj_polozky?.length || i.nastav_stav_dielu?.length) Object.assign(update, { items, ...totals(items) });
      if (i.stav && i.stav !== r.status) {
        update.status = i.stav;
        update.closedAt = i.stav === 'vydane' || i.stav === 'zrusene' ? FieldValue.serverTimestamp() : null;
        if (r.status === 'oznamene' && i.stav !== 'zrusene' && !r.receivedAt) update.receivedAt = FieldValue.serverTimestamp();
        notes.push(`Stav: ${REPAIR_LABEL[r.status]} → ${REPAIR_LABEL[i.stav]}`);
      }
      if (i.zaruka_mesiace !== undefined) update.warrantyMonths = i.zaruka_mesiace;
      if (r.kind === 'reklamacia' && (i.vysledok_reklamacie !== undefined || i.vysledok_poznamka !== undefined)) {
        const c = r.claim ?? { source: 'iny' };
        update.claim = {
          ...c,
          ...(i.vysledok_reklamacie !== undefined ? { resolution: i.vysledok_reklamacie, resolvedAt: c.resolvedAt ?? Timestamp.now() } : {}),
          ...(i.vysledok_poznamka !== undefined ? { resolutionNote: i.vysledok_poznamka } : {}),
        };
        if (i.vysledok_reklamacie) notes.push(`Výsledok reklamácie: ${CLAIM_LABEL[i.vysledok_reklamacie]}`);
      }
      if (i.diagnostika !== undefined) update.diagnosis = i.diagnostika;
      if (i.predbezna_cena !== undefined) update.estimate = i.predbezna_cena;
      if (i.zaloha !== undefined) update.deposit = i.zaloha;
      if (i.termin) update.dueAt = Timestamp.fromDate(endOfLocalDay(i.termin));
      if (i.priorita) update.priority = i.priorita;
      if (i.poznamka_pre_zakaznika !== undefined) update.notes = i.poznamka_pre_zakaznika;
      if (i.interna_poznamka !== undefined) update.internalNotes = i.interna_poznamka;
      if (i.zaplatene !== undefined) {
        update.paid = i.zaplatene;
        update.paidAt = i.zaplatene ? FieldValue.serverTimestamp() : null;
        if (i.zaplatene) notes.push('Zaplatené');
      }
      if (i.sposob_platby) update.paymentMethod = i.sposob_platby;
      if (i.zaznam_do_historie) notes.push(i.zaznam_do_historie);
      notes.push('(upravené AI asistentom)');
      update.history = FieldValue.arrayUnion(...notes.map((t) => history(ctx.actor, t)));
      await snap.ref.update(update);
      const fresh = await snap.ref.get();
      return { result: { ok: true, zakazka: repairFull(fresh, ctx) }, action: { label: `Upravená zákazka ${r.number}`, link: `/zakazky/${snap.id}` } };
    },
  }),

  tool({
    name: 'vytvor_reklamaciu',
    description:
      'Prijme reklamáciu: zariadenie opravené u nás alebo tovar kúpený u nás. Ak je zadané číslo pôvodnej zákazky (Z-…) alebo objednávky (O-…), zákazník, zariadenie a záruka sa doplnia automaticky. Lehota na vybavenie je 30 dní.',
    schema: z.object({
      povodna: z.string().optional().describe('Číslo pôvodnej zákazky alebo objednávky (napr. „Z-1042“, „O-1012“), ak je v aplikácii.'),
      zakaznik: customerIn.optional().describe('Potrebné, ak pôvodná zákazka nie je v aplikácii.'),
      zariadenie: z.object({ znacka: z.string().optional(), model: z.string().optional(), imei: z.string().optional() }).optional(),
      vada: z.string().describe('Popis reklamovanej vady.'),
      pozaduje: z.enum(['oprava', 'vymena', 'vratenie']).optional().describe('Požadovaný spôsob vybavenia.'),
      poznamka: z.string().optional(),
    }),
    label: (i) => `Prijímam reklamáciu${i.povodna ? ` k ${i.povodna}` : ''}`,
    run: async (i, ctx) => {
      let original: DocumentSnapshot | null = null;
      let source: 'oprava' | 'nakup' | 'iny' = 'iny';
      if (i.povodna) {
        const isOrder = /^o/i.test(i.povodna.trim());
        original = await findByNumber(isOrder ? 'orders' : 'repairs', i.povodna, isOrder ? ctx.settings.orderPrefix : ctx.settings.repairPrefix);
        if (!original && !isOrder) {
          original = await findByNumber('orders', i.povodna, ctx.settings.orderPrefix);
          if (original) source = 'nakup';
        } else if (original) source = isOrder ? 'nakup' : 'oprava';
        if (!original) return { result: { chyba: `Pôvodná zákazka/objednávka ${i.povodna} sa nenašla. Over číslo alebo zadaj zákazníka a zariadenie ručne (bez čísla).` } };
      }
      const o = original?.data();
      if (!o && !i.zakaznik) return { result: { chyba: 'Chýba zákazník – zadaj ho, alebo číslo pôvodnej zákazky.' } };
      const customer = o
        ? await ensureCustomer({ id: o.customerId ?? undefined, name: o.customer?.name, phone: o.customer?.phone, email: o.customer?.email })
        : await ensureCustomer({ id: i.zakaznik!.id, name: i.zakaznik!.meno, phone: i.zakaznik!.telefon, email: i.zakaznik!.email });
      const closed = ts(o?.closedAt);
      const months = source === 'nakup' ? 24 : null;
      const wEnd = closed ? (months ? warrantyEndYmd({ months }, closed) : warrantyEndYmd(warrantyOf(o!, defaultMonths(ctx)), closed)) : null;
      const device =
        source === 'oprava' && o
          ? { ...o.device, passcode: o.device?.passcode ?? '' }
          : {
              type: source === 'nakup' ? 'ine' : 'mobil',
              brand: i.zariadenie?.znacka ?? '',
              model: i.zariadenie?.model ?? (o?.items ?? []).map((x: LineItem) => x.name).join(', '),
              imei: i.zariadenie?.imei ?? '',
              color: '',
              passcode: '',
              accessories: '',
              condition: '',
            };
      const { seq, number } = await nextNumber('claims', ctx.settings.claimPrefix || 'R');
      const deadline = endOfLocalDay(localYmd(new Date(Date.now() + 30 * 86400000)));
      const data = {
        kind: 'reklamacia',
        claim: {
          source,
          originalId: original?.id ?? null,
          originalNumber: o?.number ?? null,
          originalDate: closed ? Timestamp.fromDate(closed) : null,
          warrantyUntil: wEnd ? Timestamp.fromDate(endOfLocalDay(wEnd)) : null,
          inWarranty: wEnd ? wEnd >= localYmd(new Date()) : null,
          requested: i.pozaduje ?? 'oprava',
          resolution: null,
          resolutionNote: '',
          resolvedAt: null,
        },
        number,
        seq,
        status: 'prijate',
        priority: 'normalna',
        customerId: customer.id,
        customer,
        device,
        problem: i.vada,
        diagnosis: '',
        items: [],
        total: 0,
        totalCost: 0,
        estimate: null,
        deposit: 0,
        paid: false,
        paymentMethod: null,
        paidAt: null,
        warrantyMonths: defaultMonths(ctx),
        dueAt: Timestamp.fromDate(deadline),
        notes: i.poznamka ?? '',
        internalNotes: '',
        photos: [],
        keywords: repairKeywords({ number, customer, device }),
        history: [history(ctx.actor, `Reklamácia prijatá AI asistentom${o?.number ? ` (k ${o.number})` : ''}`)],
        createdBy: ctx.actor,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        closedAt: null,
      };
      const ref = await db().collection('repairs').add(data);
      return {
        result: { ok: true, id: ref.id, cislo: number, k_zakazke: o?.number ?? null, v_zaruke: data.claim.inWarranty, zaruka_do: wEnd, lehota_do: localYmd(deadline) },
        action: { label: `Reklamácia ${number} prijatá`, link: `/zakazky/${ref.id}` },
      };
    },
  }),

  tool({
    name: 'zoznam_dielov',
    description: 'Náhradné diely v rozpracovaných zákazkách podľa stavu (treba objednať, objednané, doručené) – s dodávateľom a číslom zákazky. Použi pri otázkach „čo treba objednať“, „aké diely čakáme“.',
    schema: z.object({ stav: z.enum(['treba_objednat', 'objednane', 'dorucene', 'na_sklade']).optional() }),
    label: () => 'Pozerám diely',
    run: async ({ stav }) => {
      const snap = await db().collection('repairs').where('status', 'in', OPEN_REPAIR).get();
      const parts = snap.docs.flatMap((d) =>
        ((d.data().items ?? []) as LineItem[])
          .filter((it) => it.kind === 'diel')
          .map((it) => ({
            diel: it.name,
            pocet: it.qty,
            nakup: it.cost,
            stav: it.partStatus || 'treba_objednat',
            stav_popis: PART_LABEL[it.partStatus || 'treba_objednat'],
            dodavatel: it.supplier || undefined,
            zakazka: d.data().number,
            zariadenie: `${d.data().device?.brand ?? ''} ${d.data().device?.model ?? ''}`.trim(),
            zakaznik: d.data().customer?.name,
          })),
      );
      const list = stav ? parts.filter((p) => p.stav === stav) : parts;
      return { result: { pocet: list.length, diely: list.slice(0, 100) } };
    },
  }),

  tool({
    name: 'telefony',
    description:
      'Telefóny z výkupu určené na predaj (sklad): stav (na repas, pripravené, vystavené, rezervované, predané, vyradené), trieda A/B/C, výkupná cena, náklady na repas, cieľová cena, očakávaný zisk, úlohy na repas, dni na sklade. Bez filtra vráti telefóny na sklade.',
    schema: z.object({
      stavy: z.array(z.enum(PHONE_STATUSES)).optional(),
      hladaj: z.string().optional().describe('Model, IMEI alebo číslo výkupu (V-…).'),
    }),
    label: (i) => (i.hladaj ? `Hľadám telefón „${i.hladaj}“` : 'Pozerám sklad telefónov'),
    run: async ({ stavy, hladaj }) => {
      let docs: DocumentSnapshot[];
      if (hladaj) docs = await textSearch('phones', hladaj, (p) => [p.number, p.device?.brand, p.device?.model, p.device?.storage, p.device?.imei, p.device?.serial], 20);
      else docs = (await db().collection('phones').where('status', 'in', stavy?.length ? stavy : OPEN_PHONE).limit(200).get()).docs;
      const list = docs.map(phoneBrief).filter((p) => !stavy?.length || stavy.includes(p.stav));
      const stock = list.filter((p) => OPEN_PHONE.includes(p.stav));
      return {
        result: {
          pocet: list.length,
          hodnota_skladu: round2(stock.reduce((s, p) => s + p.naklady_spolu, 0)),
          ocakavany_zisk: round2(stock.reduce((s, p) => s + (p.zisk ?? 0), 0)),
          telefony: list.slice(0, 60),
        },
      };
    },
  }),

  tool({
    name: 'uprav_telefon',
    description: 'Upraví telefón zo skladu: stav (napr. vystavené, rezervované), cieľová/najnižšia cena, umiestnenie, pridanie nákladu na repas, označenie úlohy repasu ako hotovej. Predaj a výkup sa robia v aplikácii (doklady s podpisom).',
    schema: z.object({
      telefon: z.string().describe('Číslo výkupu (V-1001) alebo ID.'),
      stav: z.enum(['na_repas', 'pripravene', 'vystavene', 'rezervovane', 'vyradene']).optional(),
      rezervovane_pre: z.string().optional(),
      cielova_cena: money.optional(),
      najnizsia_cena: money.optional(),
      umiestnenie: z.string().optional(),
      pridaj_naklad: z.object({ nazov: z.string(), suma: money }).optional(),
      hotova_uloha: z.string().optional().describe('Názov (alebo časť) úlohy repasu, ktorá je hotová.'),
      nova_uloha: z.string().optional(),
    }),
    label: (i) => `Upravujem telefón ${i.telefon}`,
    run: async (i, ctx) => {
      const snap = await findByNumber('phones', i.telefon, ctx.settings.phonePrefix || 'V');
      if (!snap) return notFound('Telefón');
      const p = snap.data()!;
      const update: DocumentData = { updatedAt: FieldValue.serverTimestamp() };
      const notes: string[] = [];
      if (i.stav && i.stav !== p.status) {
        update.status = i.stav;
        update.closedAt = i.stav === 'vyradene' ? FieldValue.serverTimestamp() : null;
        notes.push(`Stav: ${PHONE_LABEL[p.status]} → ${PHONE_LABEL[i.stav]}`);
      }
      if (i.rezervovane_pre !== undefined) update.reservedFor = i.rezervovane_pre;
      if (i.cielova_cena !== undefined) update.targetPrice = i.cielova_cena;
      if (i.najnizsia_cena !== undefined) update.minPrice = i.najnizsia_cena;
      if (i.umiestnenie !== undefined) update.location = i.umiestnenie;
      if (i.pridaj_naklad) {
        update.costs = [...(p.costs ?? []), { id: newItemId(), name: i.pridaj_naklad.nazov, amount: i.pridaj_naklad.suma, at: Timestamp.now() }];
        notes.push(`Náklad na repas: ${i.pridaj_naklad.nazov} ${i.pridaj_naklad.suma} €`);
      }
      let tasks = p.tasks ?? [];
      if (i.hotova_uloha) {
        const q = i.hotova_uloha.toLowerCase();
        tasks = tasks.map((t: { name: string; done: boolean }) => (t.name.toLowerCase().includes(q) ? { ...t, done: true } : t));
        notes.push(`Repas: ${i.hotova_uloha} – hotové`);
      }
      if (i.nova_uloha) {
        tasks = [...tasks, { id: newItemId(), name: i.nova_uloha, done: false }];
        notes.push(`Repas – nová úloha: ${i.nova_uloha}`);
      }
      if (i.hotova_uloha || i.nova_uloha) update.tasks = tasks;
      notes.push('(upravené AI asistentom)');
      update.history = FieldValue.arrayUnion(...notes.map((t) => history(ctx.actor, t)));
      await snap.ref.update(update);
      return { result: { ok: true, telefon: phoneBrief(await snap.ref.get()) }, action: { label: `Upravený telefón ${p.number}`, link: `/telefony/${snap.id}` } };
    },
  }),

  tool({
    name: 'zoznam_objednavok',
    description: 'Zoznam malých objednávok tovaru (puzdrá, sklá, nabíjačky…). Bez filtra vráti otvorené objednávky.',
    schema: z.object({ stavy: z.array(orderStatus).optional(), limit: z.number().int().min(1).max(100).optional() }),
    label: () => 'Načítavam objednávky',
    run: async (f) => {
      const snap = await db()
        .collection('orders')
        .where('status', 'in', f.stavy?.length ? f.stavy : OPEN_ORDER)
        .limit(300)
        .get();
      const list = snap.docs.map(orderBrief).sort((a, b) => a.stav.localeCompare(b.stav));
      return { result: { pocet: list.length, objednavky: list.slice(0, f.limit ?? 50) } };
    },
  }),

  tool({
    name: 'vytvor_objednavku',
    description: 'Vytvorí malú objednávku tovaru pre zákazníka (napr. puzdro, ochranné sklo, nabíjačka).',
    schema: z.object({
      zakaznik: customerIn,
      polozky: z.array(itemIn).min(1),
      dodavatel: z.string().optional(),
      zaloha: money.optional(),
      ocakavane_dorucenie: ymd.optional(),
      poznamka: z.string().optional(),
    }),
    label: (i) => `Vytváram objednávku – ${i.polozky.map((p) => p.nazov).join(', ')}`,
    run: async (i, ctx) => {
      const customer = await ensureCustomer({ id: i.zakaznik.id, name: i.zakaznik.meno, phone: i.zakaznik.telefon, email: i.zakaznik.email });
      const { seq, number } = await nextNumber('orders', ctx.settings.orderPrefix);
      const items = i.polozky.map((x) => toItem({ ...x, typ: x.typ ?? 'tovar' }, 'tovar'));
      const data = {
        number,
        seq,
        status: 'nova',
        customerId: customer.id,
        customer,
        items,
        ...totals(items),
        supplier: i.dodavatel ?? '',
        deposit: i.zaloha ?? 0,
        paid: false,
        paymentMethod: null,
        paidAt: null,
        expectedAt: i.ocakavane_dorucenie ? Timestamp.fromDate(endOfLocalDay(i.ocakavane_dorucenie)) : null,
        orderedAt: null,
        deliveredAt: null,
        notes: i.poznamka ?? '',
        keywords: orderKeywords({ number, customer, supplier: i.dodavatel, items }),
        history: [history(ctx.actor, 'Objednávka vytvorená AI asistentom')],
        createdBy: ctx.actor,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        closedAt: null,
      };
      const ref = await db().collection('orders').add(data);
      return { result: { ok: true, id: ref.id, cislo: number, suma: data.total }, action: { label: `Vytvorená objednávka ${number}`, link: `/objednavky/${ref.id}` } };
    },
  }),

  tool({
    name: 'uprav_objednavku',
    description: 'Upraví objednávku: stav (objednaná, doručená, vydaná…), platba, dodávateľ, očakávané doručenie, poznámka, ďalšie položky.',
    schema: z.object({
      objednavka: z.string().describe('Číslo objednávky (napr. „O-1012“) alebo ID.'),
      stav: orderStatus.optional(),
      zaplatene: z.boolean().optional(),
      sposob_platby: payment.optional(),
      dodavatel: z.string().optional(),
      ocakavane_dorucenie: ymd.optional(),
      poznamka: z.string().optional(),
      pridaj_polozky: z.array(itemIn).optional(),
    }),
    label: (i) => `Upravujem objednávku ${i.objednavka}`,
    run: async (i, ctx) => {
      const snap = await findByNumber('orders', i.objednavka, ctx.settings.orderPrefix);
      if (!snap) return notFound('Objednávka');
      const o = snap.data()!;
      const update: DocumentData = { updatedAt: FieldValue.serverTimestamp() };
      const notes: string[] = [];
      if (i.stav && i.stav !== o.status) {
        update.status = i.stav;
        if (i.stav === 'objednana' && !o.orderedAt) update.orderedAt = FieldValue.serverTimestamp();
        if (i.stav === 'dorucena' && !o.deliveredAt) update.deliveredAt = FieldValue.serverTimestamp();
        update.closedAt = i.stav === 'vydana' || i.stav === 'zrusena' ? FieldValue.serverTimestamp() : null;
        notes.push(`Stav: ${ORDER_LABEL[o.status]} → ${ORDER_LABEL[i.stav]}`);
      }
      if (i.zaplatene !== undefined) {
        update.paid = i.zaplatene;
        update.paidAt = i.zaplatene ? FieldValue.serverTimestamp() : null;
        if (i.zaplatene) notes.push('Zaplatené');
      }
      if (i.sposob_platby) update.paymentMethod = i.sposob_platby;
      if (i.dodavatel !== undefined) update.supplier = i.dodavatel;
      if (i.ocakavane_dorucenie) update.expectedAt = Timestamp.fromDate(endOfLocalDay(i.ocakavane_dorucenie));
      if (i.poznamka !== undefined) update.notes = i.poznamka;
      if (i.pridaj_polozky?.length) {
        const items = [...(o.items ?? []), ...i.pridaj_polozky.map((x) => toItem(x, 'tovar'))];
        Object.assign(update, { items, ...totals(items) });
        notes.push(`Pridané: ${i.pridaj_polozky.map((x) => x.nazov).join(', ')}`);
      }
      if (i.dodavatel !== undefined || i.pridaj_polozky?.length) {
        update.keywords = orderKeywords({ ...o, supplier: update.supplier ?? o.supplier, items: update.items ?? o.items });
      }
      notes.push('(upravené AI asistentom)');
      update.history = FieldValue.arrayUnion(...notes.map((t) => history(ctx.actor, t)));
      await snap.ref.update(update);
      return { result: { ok: true, objednavka: orderBrief(await snap.ref.get()) }, action: { label: `Upravená objednávka ${o.number}`, link: `/objednavky/${snap.id}` } };
    },
  }),

  tool({
    name: 'zakaznik',
    description: 'Detail zákazníka vrátane histórie zákaziek a objednávok a celkovej útraty.',
    schema: z.object({ zakaznik: z.string().describe('ID zákazníka, meno alebo telefón.') }),
    label: (i) => `Hľadám zákazníka ${i.zakaznik}`,
    run: async ({ zakaznik }) => {
      let snap = await db().collection('customers').doc(zakaznik).get().catch(() => null);
      if (!snap?.exists) {
        const found = await textSearch('customers', zakaznik, (c) => [c.name, c.phone, c.email, c.company], 5);
        if (found.length > 1) return { result: { viac_zhod: found.map((c) => ({ id: c.id, meno: c.data().name, telefon: c.data().phone })) } };
        snap = found[0] ?? null;
      }
      if (!snap?.exists) return notFound('Zákazník');
      const c = snap.data()!;
      const [repairs, orders] = await Promise.all([
        db().collection('repairs').where('customerId', '==', snap.id).orderBy('createdAt', 'desc').limit(30).get(),
        db().collection('orders').where('customerId', '==', snap.id).orderBy('createdAt', 'desc').limit(30).get(),
      ]);
      const spent =
        repairs.docs.filter((d) => d.data().status === 'vydane').reduce((s, d) => s + repairSum(d.data()), 0) +
        orders.docs.filter((d) => d.data().status === 'vydana').reduce((s, d) => s + (d.data().total || 0), 0);
      return {
        result: {
          id: snap.id,
          meno: c.name,
          telefon: c.phone,
          email: c.email,
          firma: c.company,
          ico: c.ico,
          adresa: c.address,
          poznamka: c.note,
          utratil_spolu: round2(spent),
          zakazky: repairs.docs.map(repairBrief),
          objednavky: orders.docs.map(orderBrief),
        },
        action: { label: `Zákazník ${c.name}`, link: `/zakaznici/${snap.id}` },
      };
    },
  }),

  tool({
    name: 'uloz_zakaznika',
    description: 'Vytvorí nového zákazníka alebo upraví kontaktné údaje existujúceho (s ID).',
    schema: z.object({
      id: z.string().optional(),
      meno: z.string(),
      telefon: z.string().optional(),
      email: z.string().optional(),
      firma: z.string().optional(),
      ico: z.string().optional(),
      dic: z.string().optional(),
      adresa: z.string().optional(),
      poznamka: z.string().optional(),
    }),
    label: (i) => `Ukladám zákazníka ${i.meno}`,
    run: async (i) => {
      const data: DocumentData = { name: i.meno.trim(), updatedAt: FieldValue.serverTimestamp() };
      const map: [keyof typeof i, string][] = [
        ['telefon', 'phone'],
        ['email', 'email'],
        ['firma', 'company'],
        ['ico', 'ico'],
        ['dic', 'dic'],
        ['adresa', 'address'],
        ['poznamka', 'note'],
      ];
      for (const [from, to] of map) if (i[from] !== undefined) data[to] = i[from];
      const col = db().collection('customers');
      let id = i.id;
      if (id) {
        const prev = (await col.doc(id).get()).data() ?? {};
        data.keywords = customerKeywords({ ...prev, ...data });
        await col.doc(id).set(data, { merge: true });
      } else {
        data.keywords = customerKeywords(data);
        data.createdAt = FieldValue.serverTimestamp();
        id = (await col.add({ phone: '', email: '', company: '', ico: '', dic: '', address: '', note: '', ...data })).id;
      }
      return { result: { ok: true, id }, action: { label: `Zákazník ${i.meno}`, link: `/zakaznici/${id}` } };
    },
  }),

  tool({
    name: 'kalendar',
    description: 'Udalosti, práce a úlohy v kalendári pre zadané obdobie spolu s termínmi dokončenia otvorených zákaziek.',
    schema: z.object({ od: ymd, do: ymd }),
    label: (i) => `Pozerám kalendár ${i.od}${i.do !== i.od ? ` – ${i.do}` : ''}`,
    run: async ({ od, do: to }) => {
      const from = startOfLocalDay(od);
      const until = endOfLocalDay(to);
      const [events, repairs] = await Promise.all([
        db().collection('events').where('start', '>=', from).where('start', '<=', until).get(),
        db().collection('repairs').where('status', 'in', OPEN_REPAIR).get(),
      ]);
      return {
        result: {
          udalosti: events.docs.map(eventBrief).sort((a, b) => (a.datum + a.cas).localeCompare(b.datum + b.cas)),
          terminy_zakaziek: repairs.docs
            .map(repairBrief)
            .filter((r) => r.termin && r.termin >= od && r.termin <= to)
            .map((r) => ({ termin: r.termin, cislo: r.cislo, zariadenie: r.zariadenie, zakaznik: r.zakaznik, stav: r.stav_popis })),
        },
      };
    },
  }),

  tool({
    name: 'pridaj_do_kalendara',
    description: 'Pridá udalosť alebo úlohu do kalendára (práca na oprave, termín so zákazníkom, úloha, osobné).',
    schema: z.object({
      nazov: z.string(),
      typ: z.enum(['praca', 'termin', 'uloha', 'osobne']).describe('uloha = úloha na splnenie (to-do)'),
      datum: ymd,
      cas_od: hm.optional().describe('Bez času = celodenná položka.'),
      trvanie_min: z.number().int().min(5).max(24 * 60).optional(),
      zakazka: z.string().optional().describe('Číslo súvisiacej zákazky.'),
      poznamka: z.string().optional(),
    }),
    label: (i) => `Pridávam do kalendára: ${i.nazov}`,
    run: async (i, ctx) => {
      let repair: DocumentSnapshot | null = null;
      if (i.zakazka) repair = await findByNumber('repairs', i.zakazka, ctx.settings.repairPrefix);
      const allDay = !i.cas_od;
      const start = allDay ? startOfLocalDay(i.datum) : localToDate(i.datum, i.cas_od);
      const end = allDay ? endOfLocalDay(i.datum) : new Date(start.getTime() + (i.trvanie_min ?? 60) * 60000);
      const ref = await db()
        .collection('events')
        .add({
          title: i.nazov,
          type: i.typ,
          start: Timestamp.fromDate(start),
          end: Timestamp.fromDate(end),
          allDay,
          done: false,
          repairId: repair?.id ?? null,
          repairNumber: repair?.data()?.number ?? null,
          orderId: null,
          orderNumber: null,
          notes: i.poznamka ?? '',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      return {
        result: { ok: true, id: ref.id, datum: i.datum, cas: allDay ? 'celý deň' : `${localHm(start)}–${localHm(end)}` },
        action: { label: `${i.typ === 'uloha' ? 'Úloha' : 'Kalendár'}: ${i.nazov} (${fmtLocal(start, !allDay)})`, link: '/kalendar' },
      };
    },
  }),

  tool({
    name: 'uprav_v_kalendari',
    description: 'Upraví, presunie, označí ako splnenú alebo odstráni udalosť či úlohu v kalendári (ID získaš cez nástroj kalendar alebo prehlad_dna).',
    schema: z.object({
      id: z.string(),
      nazov: z.string().optional(),
      datum: ymd.optional(),
      cas_od: hm.optional(),
      trvanie_min: z.number().int().min(5).max(24 * 60).optional(),
      splnene: z.boolean().optional(),
      poznamka: z.string().optional(),
      odstranit: z.boolean().optional(),
    }),
    label: () => 'Upravujem kalendár',
    run: async (i) => {
      const ref = db().collection('events').doc(i.id);
      const snap = await ref.get();
      if (!snap.exists) return notFound('Udalosť');
      const e = snap.data()!;
      if (i.odstranit) {
        await ref.delete();
        return { result: { ok: true, odstranene: e.title }, action: { label: `Odstránené z kalendára: ${e.title}`, link: '/kalendar' } };
      }
      const update: DocumentData = { updatedAt: FieldValue.serverTimestamp() };
      if (i.nazov) update.title = i.nazov;
      if (i.splnene !== undefined) update.done = i.splnene;
      if (i.poznamka !== undefined) update.notes = i.poznamka;
      if (i.datum || i.cas_od || i.trvanie_min) {
        const oldStart = (e.start as Timestamp).toDate();
        const oldDur = (e.end as Timestamp).toMillis() - (e.start as Timestamp).toMillis();
        const day = i.datum ?? localYmd(oldStart);
        const allDay = i.cas_od ? false : e.allDay;
        const start = allDay ? startOfLocalDay(day) : localToDate(day, i.cas_od ?? localHm(oldStart));
        const end = allDay ? endOfLocalDay(day) : new Date(start.getTime() + (i.trvanie_min ? i.trvanie_min * 60000 : oldDur));
        Object.assign(update, { start: Timestamp.fromDate(start), end: Timestamp.fromDate(end), allDay });
      }
      await ref.update(update);
      return { result: { ok: true, udalost: eventBrief(await ref.get()) }, action: { label: `Upravené: ${i.nazov ?? e.title}`, link: '/kalendar' } };
    },
  }),

  tool({
    name: 'statistiky',
    description: 'Tržby, náklady, zisk, počty zákaziek a objednávok, najčastejšie opravy a značky za obdobie. Tržby = vydané zákazky a objednávky podľa dátumu vydania.',
    schema: z.object({ od: ymd, do: ymd }),
    label: (i) => `Počítam štatistiky ${i.od} – ${i.do}`,
    run: async ({ od, do: to }) => {
      const from = startOfLocalDay(od);
      const until = endOfLocalDay(to);
      const [closedR, closedO, created, closedP] = await Promise.all([
        db().collection('repairs').where('closedAt', '>=', from).where('closedAt', '<=', until).get(),
        db().collection('orders').where('closedAt', '>=', from).where('closedAt', '<=', until).get(),
        db().collection('repairs').where('createdAt', '>=', from).where('createdAt', '<=', until).get(),
        db().collection('phones').where('closedAt', '>=', from).where('closedAt', '<=', until).get(),
      ]);
      const ps = closedP.docs.map((d) => d.data()).filter((p) => p.status === 'predane' && p.sale);
      const pRev = ps.reduce((s, p) => s + (p.sale.price || 0), 0);
      const pCost = ps.reduce((s, p) => s + phoneCost(p), 0);
      const rs = closedR.docs.map((d) => d.data()).filter((r) => r.status === 'vydane');
      const os = closedO.docs.map((d) => d.data()).filter((o) => o.status === 'vydana');
      const rRev = rs.reduce((s, r) => s + repairSum(r), 0);
      const rCost = rs.reduce((s, r) => s + (r.totalCost || 0), 0);
      const oRev = os.reduce((s, o) => s + (o.total || 0), 0);
      const oCost = os.reduce((s, o) => s + (o.totalCost || 0), 0);
      const count = (arr: string[]) =>
        Object.entries(arr.reduce<Record<string, number>>((m, k) => ((m[k] = (m[k] ?? 0) + 1), m), {}))
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8);
      const days = rs
        .map((r) => ((r.closedAt as Timestamp).toMillis() - ((r.receivedAt ?? r.createdAt) as Timestamp).toMillis()) / 86400000)
        .filter((d) => d >= 0);
      return {
        result: {
          obdobie: `${od} – ${to}`,
          trzby_spolu: round2(rRev + oRev + pRev),
          zisk_spolu: round2(rRev + oRev + pRev - rCost - oCost - pCost),
          telefony: { predane: ps.length, trzby: round2(pRev), naklady: round2(pCost), zisk: round2(pRev - pCost) },
          servis: { vydane_zakazky: rs.length, trzby: round2(rRev), naklady: round2(rCost), priemerna_zakazka: rs.length ? round2(rRev / rs.length) : 0 },
          objednavky: { vydane: os.length, trzby: round2(oRev), naklady: round2(oCost) },
          prijate_zakazky: created.size,
          zrusene_zakazky: closedR.docs.filter((d) => d.data().status === 'zrusene').length,
          priemerna_doba_opravy_dni: days.length ? round2(days.reduce((a, b) => a + b, 0) / days.length) : null,
          najcastejsie_opravy: count(rs.flatMap((r) => (r.items ?? []).filter((i: LineItem) => i.kind !== 'diel').map((i: LineItem) => i.name))),
          znacky: count(rs.map((r) => r.device?.brand || 'neuvedené')),
          nezaplatene_vydane: rs.filter((r) => !r.paid).map((r) => r.number),
        },
      };
    },
  }),

  tool({
    name: 'priprav_spravu',
    description:
      'Pripraví správu (SMS / WhatsApp) pre zákazníka. V aplikácii sa zobrazia tlačidlá Zavolať, SMS a WhatsApp s predvyplneným textom – odoslanie potvrdí používateľ vo svojom telefóne. Použi vždy, keď chce používateľ zákazníkovi napísať, dať vedieť alebo poslať odkaz na sledovanie opravy. Text píš zdvorilo, stručne, s podpisom firmy.',
    schema: z.object({
      telefon: z.string().min(6).describe('Telefón zákazníka (zo zákazky alebo karty zákazníka).'),
      text: z.string().min(1).max(1000),
      komu: z.string().optional().describe('Meno zákazníka – na popis tlačidla.'),
    }),
    label: (i) => `Pripravujem správu${i.komu ? ` pre ${i.komu}` : ''}`,
    run: async (i) => ({
      result: { ok: true, poznamka: 'Tlačidlá na odoslanie sa zobrazili používateľovi. Text správy už neopakuj celý, stačí krátko potvrdiť.' },
      action: { label: `Správa${i.komu ? ` pre ${i.komu}` : ''}`, contact: { phone: i.telefon, text: i.text } },
    }),
  }),

  tool({
    name: 'cennik',
    description: 'Vyhľadá položky v cenníku (ceny opráv a tovaru s nákupnými cenami).',
    schema: z.object({ hladaj: z.string().optional().describe('Bez textu vráti celý cenník (max 200 položiek).') }),
    label: (i) => (i.hladaj ? `Hľadám v cenníku „${i.hladaj}“` : 'Načítavam cenník'),
    run: async ({ hladaj }) => {
      const snap = await db().collection('priceList').limit(500).get();
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as DocumentData)
        .filter((p) => !hladaj || matches([p.name, p.category, p.note], hladaj))
        .slice(0, 200)
        .map((p) => ({ id: p.id, nazov: p.name, kategoria: p.category, cena: p.price, nakup: p.cost, poznamka: p.note || undefined }));
      return { result: { pocet: list.length, polozky: list } };
    },
  }),

  tool({
    name: 'uloz_do_cennika',
    description: 'Pridá novú položku do cenníka alebo upraví existujúcu (s ID).',
    schema: z.object({ id: z.string().optional(), nazov: z.string(), kategoria: z.string().optional(), cena: money, nakup: money.optional(), poznamka: z.string().optional() }),
    label: (i) => `Ukladám do cenníka: ${i.nazov}`,
    run: async (i) => {
      const data = {
        name: i.nazov,
        category: i.kategoria ?? 'Ostatné',
        price: i.cena,
        cost: i.nakup ?? 0,
        note: i.poznamka ?? '',
        keywords: buildKeywords(i.nazov, i.kategoria),
        updatedAt: FieldValue.serverTimestamp(),
      };
      const col = db().collection('priceList');
      const id = i.id ? (await col.doc(i.id).set(data, { merge: true }), i.id) : (await col.add(data)).id;
      return { result: { ok: true, id }, action: { label: `Cenník: ${i.nazov} – ${i.cena} €`, link: '/cennik' } };
    },
  }),
];

export type AnyTool = (typeof TOOLS)[number];
export const toolByName = new Map<string, AnyTool>(TOOLS.map((t) => [t.name, t as AnyTool]));
