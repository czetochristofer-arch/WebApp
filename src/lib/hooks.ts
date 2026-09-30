import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { onSnapshot, type DocumentReference, type Query } from 'firebase/firestore';

export interface LiveState<T> {
  data: T[];
  loading: boolean;
  error: Error | null;
}

/** Živý dopyt na Firestore. `key` určuje, kedy sa má dopyt znovu vytvoriť. */
export function useLiveQuery<T extends { id: string }>(factory: () => Query | null, key: string): LiveState<T> {
  const [state, setState] = useState<LiveState<T>>({ data: [], loading: true, error: null });
  const factoryRef = useRef(factory);
  factoryRef.current = factory;
  useEffect(() => {
    const q = factoryRef.current();
    if (!q) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      q,
      (snap) => setState({ data: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T), loading: false, error: null }),
      (error) => {
        console.error('Firestore', key, error);
        setState((s) => ({ ...s, loading: false, error }));
      },
    );
  }, [key]);
  return state;
}

export function useLiveDoc<T extends { id: string }>(ref: DocumentReference | null, key: string) {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: Error | null }>({
    data: null,
    loading: true,
    error: null,
  });
  const refRef = useRef(ref);
  refRef.current = ref;
  useEffect(() => {
    const r = refRef.current;
    if (!r) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      r,
      (snap) => setState({ data: snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null, loading: false, error: null }),
      (error) => setState({ data: null, loading: false, error }),
    );
  }, [key]);
  return state;
}

export function useMediaQuery(q: string) {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(q);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia(q).matches,
    () => false,
  );
}

export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)');

export function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useOnline() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('online', cb);
      window.addEventListener('offline', cb);
      return () => {
        window.removeEventListener('online', cb);
        window.removeEventListener('offline', cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

/** Aktuálny čas, ktorý sa obnovuje každú minútu (pre "po termíne", "dnes" a pod.). */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
