import { initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';

export const FUNCTIONS_REGION = 'europe-west1';
export const useEmulators = import.meta.env.VITE_USE_EMULATORS === 'true';

let app: FirebaseApp;
export let auth: Auth;
export let db: Firestore;
export let storage: FirebaseStorage;
export let functions: Functions;

const CONFIG_CACHE_KEY = 'cs-firebase-config';

/**
 * Konfiguráciu webovej aplikácie poskytuje priamo Firebase Hosting na vyhradenej adrese
 * /__/firebase/init.json, takže ju netreba mať v kóde. Pre prípad výpadku siete sa pamätá
 * posledná známa konfigurácia.
 */
async function loadConfig(): Promise<FirebaseOptions> {
  if (useEmulators) {
    return { apiKey: 'demo-key', authDomain: 'localhost', projectId: 'demo-chrisstop', storageBucket: 'demo-chrisstop.appspot.com', appId: 'demo-app' };
  }
  const fromEnv = import.meta.env.VITE_FIREBASE_API_KEY
    ? {
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: import.meta.env.VITE_FIREBASE_APP_ID,
      }
    : null;
  if (fromEnv) return fromEnv;
  try {
    const res = await fetch('/__/firebase/init.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`init.json ${res.status}`);
    const cfg = (await res.json()) as FirebaseOptions;
    try { localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(cfg)); } catch { /* ignore */ }
    return cfg;
  } catch (err) {
    try {
      const cached = localStorage.getItem(CONFIG_CACHE_KEY);
      if (cached) return JSON.parse(cached) as FirebaseOptions;
    } catch { /* ignore */ }
    throw err;
  }
}

export async function initFirebase(): Promise<void> {
  // Prihlasovanie beží cez predvolenú doménu projektu (…firebaseapp.com), ktorú má Google
  // povolenú automaticky. Prihlásenie používa vyskakovacie okno, takže funguje aj v Safari.
  const cfg = await loadConfig();
  app = initializeApp(cfg);
  auth = getAuth(app);
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    ignoreUndefinedProperties: true,
  });
  storage = getStorage(app);
  functions = getFunctions(app, FUNCTIONS_REGION);

  if (useEmulators) {
    const h = window.location.hostname;
    connectAuthEmulator(auth, `http://${h}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, h, 8080);
    connectStorageEmulator(storage, h, 9199);
    connectFunctionsEmulator(functions, h, 5001);
  }
}
