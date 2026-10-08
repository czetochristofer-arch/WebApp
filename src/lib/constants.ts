import { addDays, addMonths } from 'date-fns';
import type {
  BusinessSettings,
  PhoneGrade,
  PhoneStatus,
  ClaimResolution,
  DeviceType,
  EventType,
  ItemKind,
  OrderStatus,
  PartStatus,
  PaymentMethod,
  Priority,
  RepairStatus,
} from './types';

export type Tone = 'gray' | 'blue' | 'violet' | 'amber' | 'orange' | 'cyan' | 'green' | 'red' | 'pink';

export const REPAIR_STATUSES: { id: RepairStatus; label: string; short: string; tone: Tone; open: boolean }[] = [
  { id: 'oznamene', label: 'Oznámené – čaká na prinesenie', short: 'Oznámené', tone: 'pink', open: true },
  { id: 'prijate', label: 'Prijaté', short: 'Prijaté', tone: 'gray', open: true },
  { id: 'diagnostika', label: 'Diagnostika', short: 'Diagnostika', tone: 'blue', open: true },
  { id: 'caka_schvalenie', label: 'Čaká na schválenie', short: 'Schválenie', tone: 'violet', open: true },
  { id: 'caka_diely', label: 'Čaká na diely', short: 'Diely', tone: 'amber', open: true },
  { id: 'v_oprave', label: 'V oprave', short: 'V oprave', tone: 'orange', open: true },
  { id: 'hotove', label: 'Hotové – na vyzdvihnutie', short: 'Hotové', tone: 'green', open: true },
  { id: 'vydane', label: 'Vydané', short: 'Vydané', tone: 'cyan', open: false },
  { id: 'zrusene', label: 'Zrušené', short: 'Zrušené', tone: 'red', open: false },
];
export const OPEN_REPAIR_STATUSES = REPAIR_STATUSES.filter((s) => s.open).map((s) => s.id);
export const repairStatus = (id: RepairStatus) => REPAIR_STATUSES.find((s) => s.id === id) ?? REPAIR_STATUSES[1];

/** Ako stav zákazky vysvetliť zákazníkovi (verejná stránka stavu). */
export const REPAIR_STATUS_PUBLIC: Record<RepairStatus, { title: string; text: string }> = {
  oznamene: { title: 'Zákazka je zaevidovaná', text: 'Čakáme, kým zariadenie prinesiete do servisu.' },
  prijate: { title: 'Zariadenie sme prijali', text: 'Zariadenie je v servise a čaká na diagnostiku.' },
  diagnostika: { title: 'Prebieha diagnostika', text: 'Zisťujeme príčinu poruchy.' },
  caka_schvalenie: { title: 'Čakáme na vaše schválenie', text: 'Diagnostika je hotová. Ozvite sa nám, prosím, či súhlasíte s cenou opravy.' },
  caka_diely: { title: 'Čakáme na náhradné diely', text: 'Diely sú objednané. Hneď po doručení pokračujeme v oprave.' },
  v_oprave: { title: 'Zariadenie je v oprave', text: 'Na oprave práve pracujeme.' },
  hotove: { title: 'Hotovo – môžete si prísť', text: 'Zariadenie je opravené a pripravené na vyzdvihnutie.' },
  vydane: { title: 'Zariadenie bolo vydané', text: 'Ďakujeme, že ste využili naše služby.' },
  zrusene: { title: 'Zákazka bola zrušená', text: 'Ak máte otázky, kontaktujte nás.' },
};

export const DEFAULT_WARRANTY_MONTHS = 12;

/** Zákonná lehota na vybavenie reklamácie (dni od jej uplatnenia). */
export const CLAIM_DAYS = 30;
export const CLAIM_RESOLUTIONS: { id: ClaimResolution; label: string; short: string; tone: Tone }[] = [
  { id: 'oprava', label: 'Uznaná – opravou', short: 'Oprava', tone: 'green' },
  { id: 'vymena', label: 'Uznaná – výmenou', short: 'Výmena', tone: 'green' },
  { id: 'vratenie', label: 'Uznaná – vrátením peňazí', short: 'Vrátenie peňazí', tone: 'cyan' },
  { id: 'zamietnuta', label: 'Zamietnutá', short: 'Zamietnutá', tone: 'red' },
];
export const claimResolution = (id?: ClaimResolution | null) => CLAIM_RESOLUTIONS.find((c) => c.id === id) ?? null;
/** Pôvodná predvolená záruka v dňoch – takto označené staršie zákazky preberajú novú predvolenú záruku. */
const LEGACY_DEFAULT_WARRANTY_DAYS = 90;

const plural = (n: number, one: string, few: string, many: string) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);

/** Záruka zákazky: nové zákazky majú mesiace, staršie dni (pôvodných 90 dní = predvolená záruka). */
export function warrantyOf(r: { warrantyMonths?: number | null; warrantyDays?: number | null }, defaultMonths = DEFAULT_WARRANTY_MONTHS) {
  if (r.warrantyMonths != null) return { months: r.warrantyMonths };
  if (r.warrantyDays != null && r.warrantyDays !== LEGACY_DEFAULT_WARRANTY_DAYS) return { days: r.warrantyDays };
  return { months: defaultMonths };
}

export function warrantyLabel(r: Parameters<typeof warrantyOf>[0], defaultMonths?: number) {
  const w = warrantyOf(r, defaultMonths);
  if ('days' in w && w.days !== undefined) return `${w.days} ${plural(w.days, 'deň', 'dni', 'dní')}`;
  const m = w.months ?? 0;
  return `${m} ${plural(m, 'mesiac', 'mesiace', 'mesiacov')}`;
}

export function warrantyUntil(r: Parameters<typeof warrantyOf>[0], from: Date, defaultMonths?: number) {
  const w = warrantyOf(r, defaultMonths);
  return 'days' in w && w.days !== undefined ? addDays(from, w.days) : addMonths(from, w.months ?? 0);
}

export const ORDER_STATUSES: { id: OrderStatus; label: string; tone: Tone; open: boolean }[] = [
  { id: 'nova', label: 'Treba objednať', tone: 'amber', open: true },
  { id: 'objednana', label: 'Objednané', tone: 'blue', open: true },
  { id: 'dorucena', label: 'Doručené – na vyzdvihnutie', tone: 'green', open: true },
  { id: 'vydana', label: 'Vydané', tone: 'cyan', open: false },
  { id: 'zrusena', label: 'Zrušené', tone: 'red', open: false },
];
export const OPEN_ORDER_STATUSES = ORDER_STATUSES.filter((s) => s.open).map((s) => s.id);
export const orderStatus = (id: OrderStatus) => ORDER_STATUSES.find((s) => s.id === id) ?? ORDER_STATUSES[0];

export const PHONE_STATUSES: { id: PhoneStatus; label: string; short: string; tone: Tone; open: boolean }[] = [
  { id: 'na_repas', label: 'Čaká na repas / opravu', short: 'Na repas', tone: 'amber', open: true },
  { id: 'pripravene', label: 'Pripravené na predaj', short: 'Pripravené', tone: 'blue', open: true },
  { id: 'vystavene', label: 'Vystavené v prevádzke', short: 'Vystavené', tone: 'green', open: true },
  { id: 'rezervovane', label: 'Rezervované', short: 'Rezervované', tone: 'violet', open: true },
  { id: 'predane', label: 'Predané', short: 'Predané', tone: 'cyan', open: false },
  { id: 'vyradene', label: 'Na diely / vyradené', short: 'Vyradené', tone: 'gray', open: false },
];
export const OPEN_PHONE_STATUSES = PHONE_STATUSES.filter((s) => s.open).map((s) => s.id);
export const phoneStatus = (id: PhoneStatus) => PHONE_STATUSES.find((s) => s.id === id) ?? PHONE_STATUSES[0];

export const PHONE_GRADES: { id: PhoneGrade; label: string; text: string; tone: Tone }[] = [
  { id: 'A', label: 'A – ako nový', text: 'Bez viditeľných stôp používania alebo len minimálne', tone: 'green' },
  { id: 'B', label: 'B – dobrý stav', text: 'Bežné stopy používania, jemné škrabance', tone: 'blue' },
  { id: 'C', label: 'C – viditeľné opotrebenie', text: 'Výraznejšie škrabance, otlaky alebo poškodenie', tone: 'orange' },
];
export const phoneGrade = (id: PhoneGrade) => PHONE_GRADES.find((g) => g.id === id) ?? PHONE_GRADES[1];

/** Kontrola funkčnosti pri výkupe (tlačí sa na výkupný doklad). */
export const PHONE_CHECKS: { id: string; label: string }[] = [
  { id: 'displej', label: 'Displej' },
  { id: 'dotyk', label: 'Dotyková vrstva' },
  { id: 'fotoaparaty', label: 'Fotoaparáty' },
  { id: 'reproduktory', label: 'Reproduktory' },
  { id: 'mikrofon', label: 'Mikrofón' },
  { id: 'nabijanie', label: 'Nabíjanie' },
  { id: 'siet', label: 'SIM / mobilná sieť' },
  { id: 'wifi', label: 'Wi-Fi / Bluetooth' },
  { id: 'biometria', label: 'Face ID / Touch ID / odtlačok' },
  { id: 'tlacidla', label: 'Tlačidlá' },
  { id: 'ucty', label: 'Odhlásený z iCloud / Google účtu' },
  { id: 'reset', label: 'Obnovené továrenské nastavenia' },
];

export const PHONE_TASK_PRESETS = ['Výmena batérie', 'Výmena displeja', 'Zadné sklo', 'Výmena konektora', 'Čistenie a kontrola', 'Aktualizácia softvéru', 'Nové ochranné sklo'];
export const STORAGE_PRESETS = ['32 GB', '64 GB', '128 GB', '256 GB', '512 GB', '1 TB'];

export const PRIORITIES: { id: Priority; label: string; tone: Tone }[] = [
  { id: 'nizka', label: 'Nízka', tone: 'gray' },
  { id: 'normalna', label: 'Normálna', tone: 'blue' },
  { id: 'vysoka', label: 'Vysoká', tone: 'orange' },
  { id: 'urgentna', label: 'Urgentná', tone: 'red' },
];
export const priority = (id: Priority) => PRIORITIES.find((p) => p.id === id) ?? PRIORITIES[1];

export const PAYMENT_METHODS: { id: PaymentMethod; label: string }[] = [
  { id: 'hotovost', label: 'Hotovosť' },
  { id: 'karta', label: 'Karta' },
  { id: 'prevod', label: 'Prevod na účet' },
];
export const paymentLabel = (id?: PaymentMethod | null) => PAYMENT_METHODS.find((p) => p.id === id)?.label ?? '—';

export const PART_STATUSES: { id: PartStatus; label: string; tone: Tone }[] = [
  { id: 'treba_objednat', label: 'Treba objednať', tone: 'red' },
  { id: 'objednane', label: 'Objednané', tone: 'amber' },
  { id: 'dorucene', label: 'Doručené', tone: 'green' },
  { id: 'na_sklade', label: 'Na sklade', tone: 'green' },
];

export const ITEM_KINDS: { id: ItemKind; label: string }[] = [
  { id: 'praca', label: 'Práca' },
  { id: 'diel', label: 'Diel' },
  { id: 'tovar', label: 'Tovar' },
  { id: 'ine', label: 'Iné' },
];

export const DEVICE_TYPES: { id: DeviceType; label: string }[] = [
  { id: 'mobil', label: 'Mobil' },
  { id: 'tablet', label: 'Tablet' },
  { id: 'notebook', label: 'Notebook / PC' },
  { id: 'hodinky', label: 'Hodinky' },
  { id: 'konzola', label: 'Konzola' },
  { id: 'ine', label: 'Iné' },
];

export const EVENT_TYPES: { id: EventType; label: string; tone: Tone }[] = [
  { id: 'praca', label: 'Práca na oprave', tone: 'orange' },
  { id: 'termin', label: 'Termín so zákazníkom', tone: 'blue' },
  { id: 'uloha', label: 'Úloha', tone: 'violet' },
  { id: 'osobne', label: 'Osobné / iné', tone: 'gray' },
];
export const eventType = (id: EventType) => EVENT_TYPES.find((t) => t.id === id) ?? EVENT_TYPES[3];

export const BRANDS = [
  'Apple', 'Samsung', 'Xiaomi', 'Redmi', 'POCO', 'Huawei', 'Honor', 'Motorola', 'Google', 'OnePlus', 'Oppo',
  'Realme', 'Vivo', 'Nokia', 'Sony', 'Nothing', 'ZTE', 'Lenovo', 'Asus', 'Acer', 'HP', 'Dell', 'MSI',
  'Garmin', 'Amazfit', 'PlayStation', 'Xbox', 'Nintendo', 'DJI', 'iPad',
];

export const COMMON_PROBLEMS = [
  'Rozbitý displej', 'Výmena batérie', 'Nenabíja', 'Zadné sklo', 'Poškodenie vodou', 'Nezapne sa',
  'Kamera', 'Reproduktor / mikrofón', 'Softvér / zaseknutý', 'Záloha dát', 'Tlačidlá', 'Face ID / Touch ID',
];

export const DEFAULT_TERMS = [
  'Zákazník svojím podpisom potvrdzuje odovzdanie zariadenia v uvedenom stave a súhlasí s podmienkami servisu.',
  'Predbežná cena je orientačná. Ak by mala byť oprava drahšia, servis zákazníka pred pokračovaním kontaktuje.',
  'Servis nezodpovedá za dáta v zariadení. Odporúčame pred opravou zálohovať.',
  'Na vykonanú opravu a vymenené diely poskytujeme záruku 12 mesiacov. Záruka sa nevzťahuje na mechanické poškodenie, poškodenie vodou a neodborný zásah.',
  'Zariadenie nevyzdvihnuté do 90 dní od oznámenia o ukončení opravy môže servis po predchádzajúcej výzve zlikvidovať alebo použiť na krytie nákladov.',
  'Osobné údaje spracúvame len na účel vybavenia opravy a v súlade s GDPR.',
].join('\n');

export const DEFAULT_SETTINGS: BusinessSettings = {
  name: 'ChrisStop',
  legalName: '',
  address: 'Hlavná 409/51, 079 01 Veľké Kapušany',
  ico: '',
  dic: '',
  icdph: '',
  vatPayer: false,
  phone: '',
  email: '',
  web: '',
  iban: '',
  logoUrl: '',
  repairPrefix: 'Z',
  orderPrefix: 'O',
  claimPrefix: 'R',
  phonePrefix: 'V',
  phoneStockPrefix: 'S',
  phoneWarrantyMonths: 12,
  defaultWarrantyMonths: DEFAULT_WARRANTY_MONTHS,
  protocolTerms: DEFAULT_TERMS,
  smsReadyTemplate: 'Dobrý deň, Vaše zariadenie {zariadenie} (zákazka {cislo}) je pripravené na vyzdvihnutie. Cena: {cena}. {firma}',
  smsOrderTemplate: 'Dobrý deň, Vaša objednávka {cislo} ({polozky}) dorazila a je pripravená na vyzdvihnutie. {firma}',
  workdayStart: 8,
  workdayEnd: 18,
  agentModel: 'sonnet',
};
