export type RepairStatus = 'Diagnostika' | 'Čaká sa' | 'Prebieha' | 'Hotovo';
export type PartsStatus = 'Dostupné skladom' | 'Chýbajú (Objednané)' | 'Na overenie' | 'Neobjednané' | 'Objednané';

export type Urgency = 'Nízka' | 'Stredná' | 'Vysoká' | 'Kritická';

export interface Repair {
  id: string;
  displayId: string;
  device: string;
  customer: string;
  phone?: string;
  status: RepairStatus;
  partsStatus: PartsStatus;
  urgency?: Urgency;
  date: string;
  time: string;
  type: string;
  price: number;
  cost: number;
  profit: number;
  notes: string;
  internalNotes?: string;
}

export type SmallOrderStatus = 'Neobjednané' | 'Objednané' | 'Doručené';

export interface SmallOrder {
  id: string;
  item: string;
  customer: string;
  phone: string;
  status: SmallOrderStatus;
  notes: string;
  createdAt: string;
  price?: number;
  cost?: number;
}
