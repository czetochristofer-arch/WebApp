import {
  forwardRef,
  useEffect,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import type { Tone } from '@/lib/constants';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

// ------------------------------------------------------------------ tlačidlá

const hasDisplay = (className?: string) => /(^|\s)(hidden|block|flex|inline-flex|grid)(\s|$)/.test(className ?? '');

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-fg hover:bg-primary-hover shadow-sm',
  secondary: 'bg-surface text-fg border border-line hover:bg-surface-2 shadow-sm',
  ghost: 'text-fg hover:bg-surface-2',
  danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
  soft: 'bg-primary-soft text-primary hover:brightness-95',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-5 text-base gap-2 rounded-xl',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, loading, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cx(
        // Ak volajúci určuje zobrazenie (napr. "hidden lg:inline-flex"), nepridávame vlastné inline-flex – inak by sa bilo s "hidden".
        hasDisplay(className) ? '' : 'inline-flex',
        'shrink-0 items-center justify-center font-semibold whitespace-nowrap transition-colors select-none disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function IconButton({
  label,
  className,
  children,
  size = 'md',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        hasDisplay(className) ? '' : 'inline-flex',
        'shrink-0 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40',
        size === 'sm' ? 'size-8' : 'size-10',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// ------------------------------------------------------------------ formuláre

const control =
  'w-full rounded-xl border border-line bg-surface px-3 text-[15px] text-fg placeholder:text-subtle shadow-xs transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60';

export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cx('flex min-w-0 flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-[13px] font-medium text-muted">
          {label}
        </label>
      )}
      {children}
      {error ? <p className="text-xs text-red-600">{error}</p> : hint ? <p className="text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; hint?: ReactNode; wrapClass?: string; suffix?: ReactNode }>(
  function Input({ label, hint, className, wrapClass, suffix, id, ...rest }, ref) {
    const auto = useId();
    const inputId = id ?? auto;
    const el = (
      <div className="relative">
        <input ref={ref} id={inputId} className={cx(control, 'h-11', suffix ? 'pr-10' : '', className)} {...rest} />
        {suffix && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-subtle">{suffix}</span>}
      </div>
    );
    if (!label && !hint) return el;
    return (
      <Field label={label} hint={hint} htmlFor={inputId} className={wrapClass}>
        {el}
      </Field>
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode; hint?: ReactNode; wrapClass?: string }>(
  function Textarea({ label, hint, className, wrapClass, id, rows = 3, ...rest }, ref) {
    const auto = useId();
    const inputId = id ?? auto;
    const el = <textarea ref={ref} id={inputId} rows={rows} className={cx(control, 'py-2.5 leading-relaxed', className)} {...rest} />;
    if (!label && !hint) return el;
    return (
      <Field label={label} hint={hint} htmlFor={inputId} className={wrapClass}>
        {el}
      </Field>
    );
  },
);

export function Select({
  label,
  hint,
  className,
  wrapClass,
  children,
  id,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: ReactNode; hint?: ReactNode; wrapClass?: string }) {
  const auto = useId();
  const inputId = id ?? auto;
  const el = (
    <select id={inputId} className={cx(control, 'h-11 appearance-none bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-9', className)} style={{ backgroundImage: CHEVRON }} {...rest}>
      {children}
    </select>
  );
  if (!label && !hint) return el;
  return (
    <Field label={label} hint={hint} htmlFor={inputId} className={wrapClass}>
      {el}
    </Field>
  );
}
const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23857d76' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")";

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-1">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-stone-300 dark:bg-stone-700')}
      >
        <span className={cx('absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-5')} />
      </button>
    </label>
  );
}

/** Prepínač medzi niekoľkými možnosťami (napr. filtre). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'md',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: ReactNode; count?: number }[];
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div className={cx('flex gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1 scrollbar-none', className)}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cx(
            'flex shrink-0 items-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
            value === o.id ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
          {o.count !== undefined && (
            <span className={cx('rounded-md px-1.5 text-[11px] tabular', value === o.id ? 'bg-primary-soft text-primary' : 'bg-surface text-muted')}>{o.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ zobrazenie

const tones: Record<Tone, string> = {
  gray: 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300',
  blue: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  violet: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  amber: 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  orange: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
  cyan: 'bg-cyan-50 text-cyan-800 dark:bg-cyan-500/15 dark:text-cyan-300',
  green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  red: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  pink: 'bg-pink-50 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300',
};
const dots: Record<Tone, string> = {
  gray: 'bg-stone-400',
  blue: 'bg-blue-500',
  violet: 'bg-violet-500',
  amber: 'bg-amber-500',
  orange: 'bg-orange-500',
  cyan: 'bg-cyan-500',
  green: 'bg-emerald-500',
  red: 'bg-red-500',
  pink: 'bg-pink-500',
};
export const toneBorder: Record<Tone, string> = {
  gray: 'border-l-stone-400',
  blue: 'border-l-blue-500',
  violet: 'border-l-violet-500',
  amber: 'border-l-amber-500',
  orange: 'border-l-orange-500',
  cyan: 'border-l-cyan-500',
  green: 'border-l-emerald-500',
  red: 'border-l-red-500',
  pink: 'border-l-pink-500',
};
export const toneDot = dots;
export const toneBg = tones;

export function Badge({ tone = 'gray', children, dot = true, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', tones[tone], className)}>
      {dot && <span className={cx('size-1.5 rounded-full', dots[tone])} />}
      {children}
    </span>
  );
}

export function Card({
  title,
  actions,
  children,
  className,
  bodyClass,
  icon,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
  icon?: ReactNode;
}) {
  return (
    <section className={cx('rounded-2xl border border-line bg-surface shadow-xs', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="flex min-w-0 items-center gap-2 text-[15px] font-semibold">
            {icon && <span className="text-muted">{icon}</span>}
            <span className="truncate">{title}</span>
          </h2>
          {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
        </header>
      )}
      <div className={cx('p-4', bodyClass)}>{children}</div>
    </section>
  );
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon && <div className="mb-1 flex size-12 items-center justify-center rounded-2xl bg-surface-2 text-muted">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {text && <p className="max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('size-5 animate-spin text-muted', className)} />;
}

export function PageLoader() {
  return (
    <div className="flex h-full min-h-[40vh] items-center justify-center">
      <Spinner className="size-7" />
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-sans text-[11px] text-muted">{children}</kbd>;
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  return (
    <span className={cx('inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary', className)}>
      {initials || '?'}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2">
        {back}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ okná

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  side,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** "right" = bočný panel na počítači (na mobile vždy celá obrazovka zospodu). */
  side?: 'right';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  const width = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="animate-fade-in absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={cx(
          'relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-surface shadow-2xl sm:rounded-2xl',
          side === 'right'
            ? 'animate-slide-up sm:animate-slide-left sm:fixed sm:top-0 sm:right-0 sm:bottom-0 sm:max-h-none sm:rounded-none sm:rounded-l-2xl ' + width
            : 'animate-slide-up ' + width,
        )}
      >
        {title !== undefined && (
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
            <h2 className="min-w-0 truncate text-lg font-semibold">{title}</h2>
            <IconButton label="Zavrieť" onClick={onClose} className="-mr-2">
              <X className="size-5" />
            </IconButton>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface px-5 py-3 pb-safe">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'gray',
  onClick,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={cx(
        'flex min-w-0 flex-col gap-2 rounded-2xl border border-line bg-surface p-4 text-left shadow-xs',
        onClick && 'transition-colors hover:border-primary/40',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-medium text-muted">{label}</span>
        {icon && <span className={cx('flex size-8 items-center justify-center rounded-xl', tones[tone])}>{icon}</span>}
      </div>
      <span className="text-2xl font-bold tracking-tight tabular">{value}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </Tag>
  );
}
