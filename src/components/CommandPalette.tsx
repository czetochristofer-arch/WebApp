import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { CornerDownLeft, Package, Search, Smartphone, Sparkles, User, Wrench } from 'lucide-react';
import { phoneName } from '@/lib/phones';
import { useData } from '@/features/data';
import { col } from '@/lib/db';
import { matches, searchToken } from '@/lib/keywords';
import { useDebounced } from '@/lib/hooks';
import { fmtPhone } from '@/lib/format';
import { orderStatus, phoneStatus, repairStatus } from '@/lib/constants';
import type { Order, Repair } from '@/lib/types';
import { NAV } from './nav';
import { Badge, Kbd, cx } from './ui';
import { createPortal } from 'react-dom';

interface Result {
  key: string;
  group: string;
  icon: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  run: () => void;
}

export function CommandPalette({ open, onClose, onAsk }: { open: boolean; onClose: () => void; onAsk: (q: string) => void }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState<{ repairs: Repair[]; orders: Order[] }>({ repairs: [], orders: [] });
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { repairs, orders, customers, phones } = useData();
  const dq = useDebounced(q, 300);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  // Staršie (uzavreté) záznamy, ktoré nie sú načítané v aplikácii, dohľadáme na serveri.
  useEffect(() => {
    const token = searchToken(dq);
    if (!open || !token || dq.trim().length < 2) {
      setRemote({ repairs: [], orders: [] });
      return;
    }
    let cancelled = false;
    Promise.all([
      getDocs(query(col.repairs(), where('keywords', 'array-contains', token), orderBy('createdAt', 'desc'), limit(15))),
      getDocs(query(col.orders(), where('keywords', 'array-contains', token), orderBy('createdAt', 'desc'), limit(10))),
    ])
      .then(([r, o]) => {
        if (cancelled) return;
        setRemote({
          repairs: r.docs.map((d) => ({ id: d.id, ...d.data() }) as Repair),
          orders: o.docs.map((d) => ({ id: d.id, ...d.data() }) as Order),
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [dq, open]);

  const go = (to: string) => {
    onClose();
    navigate(to);
  };

  const results = useMemo<Result[]>(() => {
    const out: Result[] = [];
    const text = q.trim();
    if (!text) {
      for (const n of NAV) out.push({ key: 'nav' + n.to, group: 'Prejsť na', icon: <n.icon className="size-4" />, title: n.label, run: () => go(n.to) });
      return out;
    }
    const seen = new Set<string>();
    const allRepairs = [...repairs, ...remote.repairs].filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
    const foundRepairs = allRepairs
      .filter((r) => matches([r.number, r.customer?.name, r.customer?.phone, r.device?.brand, r.device?.model, r.device?.imei, r.problem], text))
      .slice(0, 8);
    for (const r of foundRepairs) {
      const st = repairStatus(r.status);
      out.push({
        key: 'r' + r.id,
        group: 'Zákazky',
        icon: <Wrench className="size-4" />,
        title: (
          <>
            <span className="font-semibold">{r.number}</span> · {r.device.brand} {r.device.model}
          </>
        ),
        subtitle: `${r.customer?.name ?? ''} ${r.customer?.phone ? '· ' + fmtPhone(r.customer.phone) : ''}`,
        right: <Badge tone={st.tone}>{st.short}</Badge>,
        run: () => go(`/zakazky/${r.id}`),
      });
    }
    const seenO = new Set<string>();
    const allOrders = [...orders, ...remote.orders].filter((o) => (seenO.has(o.id) ? false : (seenO.add(o.id), true)));
    for (const o of allOrders
      .filter((o) => matches([o.number, o.customer?.name, o.customer?.phone, o.supplier, ...o.items.map((i) => i.name)], text))
      .slice(0, 6)) {
      const st = orderStatus(o.status);
      out.push({
        key: 'o' + o.id,
        group: 'Objednávky',
        icon: <Package className="size-4" />,
        title: (
          <>
            <span className="font-semibold">{o.number}</span> · {o.items.map((i) => i.name).join(', ')}
          </>
        ),
        subtitle: o.customer?.name,
        right: <Badge tone={st.tone}>{st.label}</Badge>,
        run: () => go(`/objednavky/${o.id}`),
      });
    }
    for (const p of phones.filter((p) => matches([p.number, p.device.brand, p.device.model, p.device.storage, p.device.imei, p.device.serial, p.seller?.name], text)).slice(0, 6)) {
      const st = phoneStatus(p.status);
      out.push({
        key: 'p' + p.id,
        group: 'Telefóny',
        icon: <Smartphone className="size-4" />,
        title: (
          <>
            <span className="font-semibold">{p.number}</span> · {phoneName(p)}
          </>
        ),
        subtitle: [p.device.color, p.device.imei && `IMEI …${p.device.imei.slice(-4)}`, p.targetPrice != null && `${p.targetPrice} €`].filter(Boolean).join(' · '),
        right: <Badge tone={st.tone}>{st.short}</Badge>,
        run: () => go(`/telefony/${p.id}`),
      });
    }
    for (const c of customers.filter((c) => matches([c.name, c.phone, c.email, c.company], text)).slice(0, 6)) {
      out.push({
        key: 'c' + c.id,
        group: 'Zákazníci',
        icon: <User className="size-4" />,
        title: c.name,
        subtitle: [fmtPhone(c.phone), c.email].filter(Boolean).join(' · '),
        run: () => go(`/zakaznici/${c.id}`),
      });
    }
    for (const n of NAV.filter((n) => matches([n.label], text))) {
      out.push({ key: 'nav' + n.to, group: 'Prejsť na', icon: <n.icon className="size-4" />, title: n.label, run: () => go(n.to) });
    }
    out.push({
      key: 'ai',
      group: 'AI asistent',
      icon: <Sparkles className="size-4 text-primary" />,
      title: (
        <>
          Opýtať sa asistenta: <span className="font-semibold">„{text}“</span>
        </>
      ),
      run: () => {
        onClose();
        onAsk(text);
      },
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, repairs, orders, customers, phones, remote]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      results[active]?.run();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  let lastGroup = '';
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center p-0 sm:p-4 sm:pt-[12vh]" role="dialog" aria-modal="true">
      <div className="animate-fade-in absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="animate-slide-up relative flex h-dvh w-full flex-col overflow-hidden border-line bg-surface shadow-2xl sm:h-auto sm:max-h-[70vh] sm:max-w-xl sm:rounded-2xl sm:border">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="size-5 shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Číslo zákazky, meno, telefón, IMEI, model…"
            className="h-14 w-full bg-transparent text-base outline-none placeholder:text-subtle"
          />
          <button onClick={onClose} className="text-sm font-medium text-muted sm:hidden">
            Zavrieť
          </button>
          <span className="hidden sm:block">
            <Kbd>Esc</Kbd>
          </span>
        </div>
        <div ref={listRef} className="flex-1 overflow-y-auto p-2">
          {results.map((r, idx) => {
            const header = r.group !== lastGroup ? r.group : null;
            lastGroup = r.group;
            return (
              <div key={r.key}>
                {header && <div className="px-3 pt-3 pb-1 text-xs font-semibold tracking-wide text-subtle uppercase">{header}</div>}
                <button
                  data-idx={idx}
                  onMouseMove={() => setActive(idx)}
                  onClick={r.run}
                  className={cx('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left', idx === active && 'bg-surface-2')}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">{r.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{r.title}</span>
                    {r.subtitle && <span className="block truncate text-xs text-muted">{r.subtitle}</span>}
                  </span>
                  {r.right}
                  {idx === active && <CornerDownLeft className="hidden size-4 text-subtle sm:block" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
