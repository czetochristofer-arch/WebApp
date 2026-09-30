import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useMediaQuery } from '@/lib/hooks';

export type ThemePref = 'system' | 'light' | 'dark';

interface ThemeApi {
  pref: ThemePref;
  resolved: 'light' | 'dark';
  setPref: (p: ThemePref) => void;
  toggle: () => void;
}
const ThemeContext = createContext<ThemeApi | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(() => {
    try {
      return (localStorage.getItem('cs-theme') as ThemePref) || 'system';
    } catch {
      return 'system';
    }
  });
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const resolved = pref === 'system' ? (systemDark ? 'dark' : 'light') : pref;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#181513' : '#ffffff');
  }, [resolved]);

  const setPref = (p: ThemePref) => {
    setPrefState(p);
    try {
      localStorage.setItem('cs-theme', p);
    } catch {
      /* ignore */
    }
  };
  return (
    <ThemeContext.Provider value={{ pref, resolved, setPref, toggle: () => setPref(resolved === 'dark' ? 'light' : 'dark') }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme mimo ThemeProvider');
  return ctx;
}
