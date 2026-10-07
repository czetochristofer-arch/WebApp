import {
  BarChart3,
  CalendarDays,
  LayoutDashboard,
  Package,
  Settings,
  ShieldAlert,
  Sparkles,
  Tags,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export const NAV: NavItem[] = [
  { to: '/', label: 'Prehľad', icon: LayoutDashboard, end: true },
  { to: '/zakazky', label: 'Zákazky', icon: Wrench },
  { to: '/reklamacie', label: 'Reklamácie', icon: ShieldAlert },
  { to: '/objednavky', label: 'Objednávky', icon: Package },
  { to: '/kalendar', label: 'Kalendár', icon: CalendarDays },
  { to: '/zakaznici', label: 'Zákazníci', icon: Users },
  { to: '/statistiky', label: 'Štatistiky', icon: BarChart3 },
  { to: '/cennik', label: 'Cenník', icon: Tags },
  { to: '/asistent', label: 'AI asistent', icon: Sparkles },
  { to: '/nastavenia', label: 'Nastavenia', icon: Settings },
];
