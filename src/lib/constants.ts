import type {
  BusinessSettings,
  DeviceType,
  EventType,
  ItemKind,
  OrderStatus,
  PartStatus,
  PaymentMethod,
  Priority,
  RepairStatus,
} from './types';

export type Tone = 'gray' | 'blue' | 'violet' | 'amber' | 'orange' | 'cyan' | 'green' | 'red';

export const REPAIR_STATUSES: { id: RepairStatus; label: string; short: string; tone: Tone; open: boolean }[] = [
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
export const repairStatus = (id: RepairStatus) => REPAIR_STATUSES.find((s) => s.id === id) ?? REPAIR_STATUSES[0];

export const ORDER_STATUSES: { id: OrderStatus; label: string; tone: Tone; open: boolean }[] = [
  { id: 'nova', label: 'Treba objednať', tone: 'amber', open: true },
  { id: 'objednana', label: 'Objednané', tone: 'blue', open: true },
  { id: 'dorucena', label: 'Doručené – na vyzdvihnutie', tone: 'green', open: true },
  { id: 'vydana', label: 'Vydané', tone: 'cyan', open: false },
  { id: 'zrusena', label: 'Zrušené', tone: 'red', open: false },
];
export const OPEN_ORDER_STATUSES = ORDER_STATUSES.filter((s) => s.open).map((s) => s.id);
export const orderStatus = (id: OrderStatus) => ORDER_STATUSES.find((s) => s.id === id) ?? ORDER_STATUSES[0];

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
  'Na vykonanú opravu a vymenené diely poskytujeme záruku v uvedenej dĺžke. Záruka sa nevzťahuje na mechanické poškodenie, poškodenie vodou a neodborný zásah.',
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
  defaultWarrantyDays: 90,
  protocolTerms: DEFAULT_TERMS,
  smsReadyTemplate: 'Dobrý deň, Vaše zariadenie {zariadenie} (zákazka {cislo}) je pripravené na vyzdvihnutie. Cena: {cena}. {firma}',
  smsOrderTemplate: 'Dobrý deň, Vaša objednávka {cislo} ({polozky}) dorazila a je pripravená na vyzdvihnutie. {firma}',
  workdayStart: 8,
  workdayEnd: 18,
};
