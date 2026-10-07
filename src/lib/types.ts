import type { Timestamp } from 'firebase/firestore';

export type Role = 'owner' | 'staff';

export interface Member {
  id: string;
  email: string;
  name?: string;
  role: Role;
  createdAt?: Timestamp;
}

export interface CustomerRef {
  id?: string | null;
  name: string;
  phone?: string;
  email?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  company?: string;
  ico?: string;
  dic?: string;
  address?: string;
  note?: string;
  keywords: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type RepairStatus =
  | 'oznamene'
  | 'prijate'
  | 'diagnostika'
  | 'caka_schvalenie'
  | 'caka_diely'
  | 'v_oprave'
  | 'hotove'
  | 'vydane'
  | 'zrusene';

export type Priority = 'nizka' | 'normalna' | 'vysoka' | 'urgentna';
export type PaymentMethod = 'hotovost' | 'karta' | 'prevod';
export type PartStatus = 'treba_objednat' | 'objednane' | 'na_sklade' | 'dorucene';
export type ItemKind = 'praca' | 'diel' | 'tovar' | 'ine';
export type DeviceType = 'mobil' | 'tablet' | 'notebook' | 'hodinky' | 'konzola' | 'ine';

export interface LineItem {
  id: string;
  kind: ItemKind;
  name: string;
  qty: number;
  price: number; // predajná cena za kus (s DPH, ak je platiteľ)
  cost: number; // nákupná cena za kus
  partStatus?: PartStatus | null;
  supplier?: string;
}

export interface HistoryEntry {
  at: Timestamp;
  by: string;
  text: string;
}

export interface Photo {
  path: string;
  url: string;
  name?: string;
}

export interface Device {
  type: DeviceType;
  brand: string;
  model: string;
  imei?: string;
  color?: string;
  passcode?: string;
  accessories?: string;
  condition?: string;
}

export type RepairKind = 'oprava' | 'reklamacia';
/** Spôsob vybavenia reklamácie. */
export type ClaimResolution = 'oprava' | 'vymena' | 'vratenie' | 'zamietnuta';

export interface ClaimInfo {
  /** Čo sa reklamuje: oprava u nás, tovar kúpený u nás, alebo záznam mimo aplikácie (papierová evidencia). */
  source: 'oprava' | 'nakup' | 'iny';
  originalId?: string | null;
  originalNumber?: string | null;
  /** Dátum vydania opravy / predaja tovaru. */
  originalDate?: Timestamp | null;
  warrantyUntil?: Timestamp | null;
  inWarranty?: boolean | null;
  requested?: ClaimResolution | null;
  resolution?: ClaimResolution | null;
  resolutionNote?: string;
  resolvedAt?: Timestamp | null;
}

export interface Repair {
  id: string;
  /** Chýba pri bežných zákazkách (= oprava). */
  kind?: RepairKind;
  claim?: ClaimInfo | null;
  number: string;
  seq: number;
  status: RepairStatus;
  priority: Priority;
  customerId?: string | null;
  customer: CustomerRef;
  device: Device;
  problem: string;
  diagnosis?: string;
  items: LineItem[];
  estimate?: number | null;
  deposit: number;
  paid: boolean;
  paymentMethod?: PaymentMethod | null;
  paidAt?: Timestamp | null;
  /** Záruka v mesiacoch (nové zákazky). */
  warrantyMonths?: number | null;
  /** Pôvodná záruka v dňoch – len staršie zákazky. */
  warrantyDays?: number | null;
  dueAt?: Timestamp | null;
  notes?: string;
  internalNotes?: string;
  photos: Photo[];
  history: HistoryEntry[];
  keywords: string[];
  total: number;
  totalCost: number;
  createdAt: Timestamp;
  /** Kedy zákazník zariadenie priniesol (pri zákazkách, ktoré začali ako „oznámené“). */
  receivedAt?: Timestamp | null;
  updatedAt?: Timestamp;
  closedAt?: Timestamp | null;
  createdBy?: string;
}

export type OrderStatus = 'nova' | 'objednana' | 'dorucena' | 'vydana' | 'zrusena';

export interface Order {
  id: string;
  number: string;
  seq: number;
  status: OrderStatus;
  customerId?: string | null;
  customer: CustomerRef;
  items: LineItem[];
  supplier?: string;
  deposit: number;
  paid: boolean;
  paymentMethod?: PaymentMethod | null;
  paidAt?: Timestamp | null;
  expectedAt?: Timestamp | null;
  orderedAt?: Timestamp | null;
  deliveredAt?: Timestamp | null;
  notes?: string;
  history: HistoryEntry[];
  keywords: string[];
  total: number;
  totalCost: number;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  closedAt?: Timestamp | null;
  createdBy?: string;
}

export type EventType = 'praca' | 'termin' | 'uloha' | 'osobne';

export interface CalendarEvent {
  id: string;
  title: string;
  type: EventType;
  start: Timestamp;
  end: Timestamp;
  allDay: boolean;
  done: boolean;
  repairId?: string | null;
  repairNumber?: string | null;
  orderId?: string | null;
  orderNumber?: string | null;
  notes?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface PriceItem {
  id: string;
  name: string;
  category: string;
  price: number;
  cost: number;
  note?: string;
  keywords: string[];
  updatedAt?: Timestamp;
}

export interface BusinessSettings {
  name: string;
  legalName?: string;
  address?: string;
  ico?: string;
  dic?: string;
  icdph?: string;
  vatPayer: boolean;
  phone?: string;
  email?: string;
  web?: string;
  iban?: string;
  logoUrl?: string;
  repairPrefix: string;
  orderPrefix: string;
  claimPrefix?: string;
  defaultWarrantyMonths: number;
  protocolTerms: string;
  smsReadyTemplate: string;
  smsOrderTemplate: string;
  workdayStart: number;
  workdayEnd: number;
  /** Model AI asistenta pre nové konverzácie. */
  agentModel?: AgentModel;
}

export type AgentModel = 'sonnet' | 'haiku';
