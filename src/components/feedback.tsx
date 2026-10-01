import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, XCircle } from 'lucide-react';
import { Button, Modal, cx } from './ui';

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
  action?: { label: string; onClick: () => void };
}
interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}

interface FeedbackApi {
  toast: (text: string, kind?: ToastKind, action?: ToastItem['action']) => void;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  /** Spustí asynchrónnu akciu a pri chybe zobrazí hlášku. */
  run: <T>(fn: () => Promise<T>, success?: string) => Promise<T | undefined>;
}

const FeedbackContext = createContext<FeedbackApi | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const idRef = useRef(0);

  const toast = useCallback<FeedbackApi['toast']>((text, kind = 'success', action) => {
    const id = ++idRef.current;
    setToasts((t) => [...t.slice(-3), { id, kind, text, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3500);
  }, []);

  const confirm = useCallback<FeedbackApi['confirm']>(
    (opts) => new Promise<boolean>((resolve) => setConfirmState({ ...opts, resolve })),
    [],
  );

  const run = useCallback<FeedbackApi['run']>(
    async (fn, success) => {
      try {
        const r = await fn();
        if (success) toast(success);
        // Úspech akcie bez návratovej hodnoty musí byť odlíšiteľný od chyby (tá vracia undefined).
        return (r === undefined ? true : r) as typeof r;
      } catch (err) {
        console.error(err);
        const msg = err instanceof Error ? err.message : String(err);
        toast(`Nepodarilo sa: ${friendlyError(msg)}`, 'error');
        return undefined;
      }
    },
    [toast],
  );

  const close = (v: boolean) => {
    confirmState?.resolve(v);
    setConfirmState(null);
  };

  return (
    <FeedbackContext.Provider value={{ toast, confirm, run }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cx(
              'animate-slide-up pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium shadow-lg',
              'border-line bg-surface text-fg',
            )}
          >
            {t.kind === 'success' && <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />}
            {t.kind === 'error' && <XCircle className="size-5 shrink-0 text-red-500" />}
            {t.kind === 'info' && <Info className="size-5 shrink-0 text-blue-500" />}
            <span>{t.text}</span>
            {t.action && (
              <button className="ml-1 font-semibold text-primary" onClick={t.action.onClick}>
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
      <Modal
        open={!!confirmState}
        onClose={() => close(false)}
        title={confirmState?.title}
        size="sm"
        footer={
          <>
            <Button onClick={() => close(false)}>Zrušiť</Button>
            <Button variant={confirmState?.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
              {confirmState?.confirmLabel ?? 'Potvrdiť'}
            </Button>
          </>
        }
      >
        <div className="text-sm text-muted">{confirmState?.message}</div>
      </Modal>
    </FeedbackContext.Provider>
  );
}

function friendlyError(msg: string) {
  if (/permission|insufficient/i.test(msg)) return 'nemáte oprávnenie na túto akciu.';
  if (/network|offline|unavailable/i.test(msg)) return 'chýba pripojenie. Skúste znova.';
  return msg;
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback mimo FeedbackProvider');
  return ctx;
}
