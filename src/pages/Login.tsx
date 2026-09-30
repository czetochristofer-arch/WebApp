import { useState, type FormEvent } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { MailCheck, ShieldAlert } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { signInWithGoogle, useAuth } from '@/features/auth';
import { Button, Input, Spinner } from '@/components/ui';
import { Logo } from '@/components/Layout';

export function SplashScreen() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4">
      <Logo />
      <Spinner />
    </div>
  );
}

function authMessage(code: string) {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Nesprávny e-mail alebo heslo.';
    case 'auth/email-already-in-use':
      return 'Účet s týmto e-mailom už existuje – prihláste sa.';
    case 'auth/weak-password':
      return 'Heslo musí mať aspoň 6 znakov.';
    case 'auth/too-many-requests':
      return 'Príliš veľa pokusov. Skúste to o chvíľu.';
    case 'auth/popup-closed-by-user':
      return '';
    case 'auth/network-request-failed':
      return 'Chýba pripojenie na internet.';
    default:
      return 'Prihlásenie sa nepodarilo (' + code + ').';
  }
}

export function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const withBusy = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await fn();
    } catch (err) {
      setError(authMessage((err as { code?: string }).code ?? String(err)));
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    withBusy(async () => {
      if (mode === 'login') await signInWithEmailAndPassword(auth, email.trim(), password);
      else {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await sendEmailVerification(cred.user);
      }
    });
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Logo />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">ChrisStop Servis</h1>
            <p className="text-sm text-muted">Zákazky, objednávky a harmonogram na jednom mieste</p>
          </div>
        </div>
        <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
          <Button variant="secondary" size="lg" className="w-full" loading={busy} onClick={() => withBusy(signInWithGoogle)} icon={<GoogleIcon />}>
            Pokračovať cez Google
          </Button>
          <div className="my-5 flex items-center gap-3 text-xs text-subtle">
            <span className="h-px flex-1 bg-line" /> alebo e-mailom <span className="h-px flex-1 bg-line" />
          </div>
          <form onSubmit={submit} className="space-y-3">
            <Input type="email" autoComplete="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder="Heslo"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            {info && <p className="text-sm text-emerald-600">{info}</p>}
            <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
              {mode === 'login' ? 'Prihlásiť sa' : 'Vytvoriť účet'}
            </Button>
          </form>
          <div className="mt-4 flex justify-between text-sm">
            <button className="font-medium text-primary" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
              {mode === 'login' ? 'Nový účet' : 'Mám účet'}
            </button>
            {mode === 'login' && (
              <button
                className="text-muted hover:text-fg"
                onClick={() =>
                  email
                    ? withBusy(async () => {
                        await sendPasswordResetEmail(auth, email.trim());
                        setInfo('Poslali sme vám e-mail na obnovu hesla.');
                      })
                    : setError('Najprv zadajte e-mail.')
                }
              >
                Zabudnuté heslo
              </button>
            )}
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-subtle">Prístup majú iba schválené účty majiteľa a pozvaných členov tímu.</p>
      </div>
    </div>
  );
}

export function NoAccessPage() {
  const { user, signOut, retryAccess, accessError } = useAuth();
  const [sent, setSent] = useState(false);
  const unverified = user && !user.emailVerified && user.providerData.some((p) => p.providerId === 'password');
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg p-4">
      <div className="w-full max-w-md rounded-3xl border border-line bg-surface p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
          {unverified ? <MailCheck /> : <ShieldAlert />}
        </div>
        {unverified ? (
          <>
            <h1 className="text-xl font-bold">Potvrďte svoj e-mail</h1>
            <p className="mt-2 text-sm text-muted">
              Na <b>{user.email}</b> sme poslali odkaz na overenie. Po kliknutí naň stlačte „Skontrolovať znova“.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold">Tento účet nemá prístup</h1>
            <p className="mt-2 text-sm text-muted">
              Účet <b>{user?.email}</b> zatiaľ nie je členom tímu ChrisStop. Požiadajte majiteľa, aby vás pozval v Nastaveniach → Tím.
            </p>
          </>
        )}
        {accessError && <p className="mt-3 text-xs text-subtle">{accessError}</p>}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {unverified && (
            <Button
              disabled={sent}
              onClick={async () => {
                if (user) await sendEmailVerification(user);
                setSent(true);
              }}
            >
              {sent ? 'Odoslané' : 'Poslať znova'}
            </Button>
          )}
          <Button
            variant="primary"
            onClick={async () => {
              await user?.reload();
              await user?.getIdToken(true);
              retryAccess();
            }}
          >
            Skontrolovať znova
          </Button>
          <Button variant="ghost" onClick={signOut}>
            Odhlásiť sa
          </Button>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}
