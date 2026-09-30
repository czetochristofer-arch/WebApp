import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '@/lib/firebase';
import type { Member } from '@/lib/types';

type AuthStatus = 'loading' | 'signedOut' | 'noAccess' | 'ready';

interface AuthState {
  status: AuthStatus;
  user: User | null;
  member: Member | null;
  accessError: string | null;
  isOwner: boolean;
  retryAccess: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [member, setMember] = useState<Member | null>(null);
  const [memberChecked, setMemberChecked] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        setAuthReady(true);
        setMember(null);
        setMemberChecked(false);
        setAccessError(null);
      }),
    [],
  );

  useEffect(() => {
    if (!user) return;
    let joined = false;
    const unsub = onSnapshot(
      doc(db, 'members', user.uid),
      async (snap) => {
        if (snap.exists()) {
          setMember({ id: snap.id, ...snap.data() } as Member);
          setMemberChecked(true);
          return;
        }
        setMember(null);
        if (joined) {
          setMemberChecked(true);
          return;
        }
        joined = true;
        try {
          // Server overí, či je účet majiteľa alebo pozvaný, a vytvorí členstvo.
          await httpsCallable(functions, 'joinWorkspace')();
        } catch (err) {
          setAccessError(err instanceof Error ? err.message : String(err));
          setMemberChecked(true);
        }
      },
      (err) => {
        setAccessError(err.message);
        setMemberChecked(true);
      },
    );
    return unsub;
  }, [user, attempt]);

  let status: AuthStatus = 'loading';
  if (authReady && !user) status = 'signedOut';
  else if (user && memberChecked) status = member ? 'ready' : 'noAccess';

  const value: AuthState = {
    status,
    user,
    member,
    accessError,
    isOwner: member?.role === 'owner',
    retryAccess: () => {
      setAccessError(null);
      setMemberChecked(false);
      setAttempt((a) => a + 1);
    },
    signOut: () => fbSignOut(auth),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth mimo AuthProvider');
  return ctx;
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(auth, provider);
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw err;
  }
}
