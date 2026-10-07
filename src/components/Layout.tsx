import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  CalendarPlus,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Menu,
  Moon,
  Package,
  PackagePlus,
  Plus,
  Search,
  ShieldAlert,
  Sparkles,
  Sun,
  UserPlus,
  WifiOff,
  Wrench,
} from 'lucide-react';
import { useAuth } from '@/features/auth';
import { useData } from '@/features/data';
import { useIsDesktop, useOnline } from '@/lib/hooks';
import { NAV } from './nav';
import { Avatar, Button, IconButton, Kbd, Modal, cx } from './ui';
import { CommandPalette } from './CommandPalette';
import { AssistantChat } from '@/features/assistant/AssistantChat';
import { useTheme } from '@/features/theme';

interface ShellApi {
  openSearch: () => void;
  openAssistant: (prompt?: string) => void;
  openQuickCreate: () => void;
}
const ShellContext = createContext<ShellApi | null>(null);
export const useShell = () => {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error('useShell mimo Layout');
  return ctx;
};

export function Layout() {
  const { user, member, signOut } = useAuth();
  const { repairs, orders } = useData();
  const isDesktop = useIsDesktop();
  const online = useOnline();
  const navigate = useNavigate();
  const location = useLocation();
  const { resolved, toggle } = useTheme();
  const [searchOpen, setSearchOpen] = useState(false);
  const [assistant, setAssistant] = useState<{ open: boolean; prompt?: string; key: number }>({ open: false, key: 0 });
  const [quickOpen, setQuickOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const openAll = repairs.filter((r) => r.status !== 'vydane' && r.status !== 'zrusene');
  const openClaims = openAll.filter((r) => r.kind === 'reklamacia').length;
  const openRepairs = openAll.length - openClaims;
  const openOrders = orders.filter((o) => o.status !== 'vydana' && o.status !== 'zrusena').length;
  const counts: Record<string, number> = { '/zakazky': openRepairs, '/reklamacie': openClaims, '/objednavky': openOrders };

  const api: ShellApi = {
    openSearch: () => setSearchOpen(true),
    openAssistant: (prompt) => {
      if (!isDesktop) {
        navigate('/asistent', { state: { prompt } });
        return;
      }
      setAssistant((a) => ({ open: true, prompt, key: prompt ? a.key + 1 : a.key }));
    },
    openQuickCreate: () => setQuickOpen(true),
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = /INPUT|TEXTAREA|SELECT/.test(target.tagName) || target.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      } else if (!typing && e.key === '/') {
        e.preventDefault();
        setSearchOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        api.openAssistant();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => setMenuOpen(false), [location.pathname]);

  const name = member?.name || user?.displayName || user?.email || '';

  return (
    <ShellContext.Provider value={api}>
      <div className="flex h-dvh overflow-hidden">
        {/* Bočný panel – počítač */}
        <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface lg:flex">
          <div className="flex h-16 items-center gap-2.5 px-5">
            <Logo />
            <div className="leading-tight">
              <div className="font-bold tracking-tight">ChrisStop</div>
              <div className="text-xs text-muted">Servis</div>
            </div>
          </div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cx(
                    'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                    isActive ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-surface-2 hover:text-fg',
                  )
                }
              >
                <item.icon className="size-[18px]" />
                <span className="flex-1">{item.label}</span>
                {!!counts[item.to] && <span className="rounded-md bg-surface-2 px-1.5 text-xs text-muted tabular">{counts[item.to]}</span>}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2 border-t border-line p-3">
            <Avatar name={name} className="size-8 text-xs" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{name}</div>
              <div className="text-xs text-muted">{member?.role === 'owner' ? 'Majiteľ' : 'Člen tímu'}</div>
            </div>
            <IconButton label={resolved === 'dark' ? 'Svetlý režim' : 'Tmavý režim'} size="sm" onClick={toggle}>
              {resolved === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </IconButton>
            <IconButton label="Odhlásiť sa" size="sm" onClick={signOut}>
              <LogOut className="size-4" />
            </IconButton>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Horná lišta */}
          <header className="pt-safe z-20 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface/90 px-3 backdrop-blur lg:h-16 lg:px-6">
            <IconButton label="Menu" className="lg:hidden" onClick={() => setMenuOpen(true)}>
              <Menu className="size-5" />
            </IconButton>
            <div className="flex items-center gap-2 lg:hidden">
              <Logo small />
              <span className="font-bold tracking-tight">ChrisStop</span>
            </div>
            <button
              onClick={() => setSearchOpen(true)}
              className="ml-auto hidden h-10 w-full max-w-md items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 text-sm text-subtle transition-colors hover:border-primary/40 lg:ml-0 lg:flex"
            >
              <Search className="size-4" />
              <span className="flex-1 text-left">Hľadať zákazku, zákazníka, telefón…</span>
              <Kbd>Ctrl K</Kbd>
            </button>
            <div className="ml-auto flex items-center gap-1 lg:gap-2">
              <IconButton label="Hľadať" className="lg:hidden" onClick={() => setSearchOpen(true)}>
                <Search className="size-5" />
              </IconButton>
              <Button variant="soft" icon={<Sparkles className="size-4" />} onClick={() => api.openAssistant()} className="hidden lg:inline-flex">
                AI asistent
              </Button>
              <IconButton label="AI asistent" className="text-primary lg:hidden" onClick={() => api.openAssistant()}>
                <Sparkles className="size-5" />
              </IconButton>
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setQuickOpen(true)} className="hidden lg:inline-flex">
                Nový záznam
              </Button>
            </div>
          </header>

          {!online && (
            <div className="flex items-center justify-center gap-2 bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
              <WifiOff className="size-3.5" /> Ste offline – zmeny sa uložia a odošlú po pripojení.
            </div>
          )}

          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-7xl px-4 pt-5 pb-28 lg:px-8 lg:pt-7 lg:pb-12">
              <Outlet />
            </div>
          </main>

          {/* Spodná lišta – mobil */}
          <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur lg:hidden">
            <div className="mx-auto grid h-16 max-w-lg grid-cols-5 items-center">
              <BottomLink to="/" end icon={<LayoutDashboard className="size-5" />} label="Prehľad" />
              <BottomLink to="/zakazky" icon={<Wrench className="size-5" />} label="Zákazky" count={openRepairs} />
              <div className="flex justify-center">
                <button
                  onClick={() => setQuickOpen(true)}
                  aria-label="Nový záznam"
                  className="flex size-13 -translate-y-3 items-center justify-center rounded-2xl bg-primary text-primary-fg shadow-lg shadow-primary/30 active:scale-95"
                >
                  <Plus className="size-6" />
                </button>
              </div>
              <BottomLink to="/objednavky" icon={<Package className="size-5" />} label="Objednávky" count={openOrders} />
              <BottomLink to="/kalendar" icon={<CalendarDays className="size-5" />} label="Kalendár" />
            </div>
          </nav>
        </div>
      </div>

      {/* Mobilné menu */}
      <Modal open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu" size="sm">
        <div className="-mx-2 space-y-0.5">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cx('flex items-center gap-3 rounded-xl px-3 py-3 font-medium', isActive ? 'bg-primary-soft text-primary' : 'hover:bg-surface-2')
              }
            >
              <item.icon className="size-5" /> {item.label}
            </NavLink>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2 border-t border-line pt-4">
          <Avatar name={name} className="size-9" />
          <div className="min-w-0 flex-1 truncate text-sm font-medium">{name}</div>
          <IconButton label="Prepnúť režim" onClick={toggle}>
            {resolved === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </IconButton>
          <IconButton label="Odhlásiť sa" onClick={signOut}>
            <LogOut className="size-5" />
          </IconButton>
        </div>
      </Modal>

      <QuickCreate open={quickOpen} onClose={() => setQuickOpen(false)} />
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} onAsk={(q) => api.openAssistant(q)} />

      {isDesktop && (
        <Modal open={assistant.open} onClose={() => setAssistant((a) => ({ ...a, open: false }))} title="AI asistent" side="right" size="lg">
          <div className="-mx-5 -my-4 flex h-[calc(100dvh-4rem)] flex-col">
            <AssistantChat key={assistant.key} initialPrompt={assistant.prompt} compact />
          </div>
        </Modal>
      )}
    </ShellContext.Provider>
  );
}

function BottomLink({ to, icon, label, end, count }: { to: string; icon: ReactNode; label: string; end?: boolean; count?: number }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => cx('relative flex flex-col items-center gap-0.5 py-1 text-[11px] font-medium', isActive ? 'text-primary' : 'text-muted')}
    >
      {icon}
      {label}
      {!!count && (
        <span className="absolute top-0 right-[calc(50%-20px)] min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 font-bold text-primary-fg">
          {count}
        </span>
      )}
    </NavLink>
  );
}

export function Logo({ small }: { small?: boolean }) {
  return (
    <span className={cx('flex items-center justify-center rounded-xl bg-primary text-primary-fg shadow-sm', small ? 'size-7' : 'size-9')}>
      <Wrench className={small ? 'size-4' : 'size-5'} strokeWidth={2.4} />
    </span>
  );
}

function QuickCreate({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const go = (to: string) => {
    onClose();
    navigate(to);
  };
  const items = [
    { icon: <Wrench className="size-5" />, label: 'Nová zákazka', hint: 'Prijatie zariadenia do servisu', to: '/zakazky/nova' },
    { icon: <ShieldAlert className="size-5" />, label: 'Reklamácia', hint: 'Oprava alebo tovar kúpený u nás', to: '/reklamacie/nova' },
    { icon: <PackagePlus className="size-5" />, label: 'Nová objednávka', hint: 'Puzdro, sklo, nabíjačka…', to: '/objednavky?nova=1' },
    { icon: <CalendarPlus className="size-5" />, label: 'Udalosť v kalendári', hint: 'Termín, práca, stretnutie', to: '/kalendar?nova=termin' },
    { icon: <ListTodo className="size-5" />, label: 'Úloha', hint: 'Čo treba urobiť', to: '/kalendar?nova=uloha' },
    { icon: <UserPlus className="size-5" />, label: 'Nový zákazník', hint: 'Kontakt do adresára', to: '/zakaznici?novy=1' },
  ];
  return (
    <Modal open={open} onClose={onClose} title="Vytvoriť" size="sm">
      <div className="-mx-2 grid gap-1">
        {items.map((i) => (
          <button key={i.to} onClick={() => go(i.to)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-surface-2">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">{i.icon}</span>
            <span>
              <span className="block font-semibold">{i.label}</span>
              <span className="block text-sm text-muted">{i.hint}</span>
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
