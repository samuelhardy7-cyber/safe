import {initializeApp, getApps, getApp} from 'firebase/app';
import {browserLocalPersistence, getAuth, setPersistence} from 'firebase/auth';
import {doc, getDocFromServer, getFirestore} from 'firebase/firestore';
import {getStorage} from 'firebase/storage';
import firebaseAppletConfig from '../firebase-applet-config.json';
import {
  validateFirebaseConfigIntegrity,
  type FirebaseConfigIntegrityResult,
} from './domain/authDiagnostics';

export interface FirebaseStatusInfo {
  configured: boolean;
  projectId: string;
  databaseId: string;
  authDomain: string;
  connectionState: 'checking' | 'connected' | 'offline' | 'unconfigured';
  errorMessage?: string;
}

const envConfigCandidate = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY || '').trim(),
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '').trim(),
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID || '').trim(),
  storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '').trim(),
  messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim(),
  appId: (import.meta.env.VITE_FIREBASE_APP_ID || '').trim(),
  firestoreDatabaseId: (import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || '').trim(),
};

// Only use VITE_FIREBASE_* override if a complete coherent config set is explicitly defined;
// never mix dev/staging/production fields across JSON and partial env overrides.
const hasCompleteEnvConfig = Boolean(
  envConfigCandidate.apiKey &&
    envConfigCandidate.authDomain &&
    envConfigCandidate.projectId &&
    envConfigCandidate.storageBucket &&
    envConfigCandidate.messagingSenderId &&
    envConfigCandidate.appId,
);

const resolvedFirebaseConfig = hasCompleteEnvConfig
  ? {
      ...firebaseAppletConfig,
      ...envConfigCandidate,
      firestoreDatabaseId:
        envConfigCandidate.firestoreDatabaseId || firebaseAppletConfig.firestoreDatabaseId,
    }
  : firebaseAppletConfig;

export const FIREBASE_CONFIG_AUDIT: FirebaseConfigIntegrityResult =
  validateFirebaseConfigIntegrity(resolvedFirebaseConfig);

export const isFirebaseConfigured = FIREBASE_CONFIG_AUDIT.valid;

const app = getApps().length > 0 ? getApp() : initializeApp(resolvedFirebaseConfig);

export const firebaseApp = app;
export const auth = getAuth(app);
auth.useDeviceLanguage();

// Explicitly reinforce browserLocalPersistence without breaking restricted WebViews
void setPersistence(auth, browserLocalPersistence).catch(() => {
  // Fallback to Firebase Auth default persistence in restricted storage environments
});

export const db = getFirestore(app, resolvedFirebaseConfig.firestoreDatabaseId);
export const storage = getStorage(app);

export const FIREBASE_META = {
  projectId: resolvedFirebaseConfig.projectId || '',
  databaseId: resolvedFirebaseConfig.firestoreDatabaseId || '(default)',
  authDomain: resolvedFirebaseConfig.authDomain || '',
  storageBucket: resolvedFirebaseConfig.storageBucket || '',
  configSource: hasCompleteEnvConfig ? 'env_complete' : 'firebase-applet-config.json',
  authInitialized: Boolean(auth && auth.app === app && app.options.projectId === resolvedFirebaseConfig.projectId),
  hasOAuthClientId: Boolean(firebaseAppletConfig.oAuthClientId),
  configIssues: FIREBASE_CONFIG_AUDIT.issues,
};

export async function verifyFirestoreConnection(): Promise<FirebaseStatusInfo> {
  if (!isFirebaseConfigured) {
    return {
      configured: false,
      projectId: FIREBASE_META.projectId,
      databaseId: FIREBASE_META.databaseId,
      authDomain: FIREBASE_META.authDomain,
      connectionState: 'unconfigured',
      errorMessage:
        FIREBASE_CONFIG_AUDIT.issues[0] ||
        'Konfigurasi Firebase belum lengkap pada firebase-applet-config.json.',
    };
  }

  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return {
      configured: true,
      projectId: FIREBASE_META.projectId,
      databaseId: FIREBASE_META.databaseId,
      authDomain: FIREBASE_META.authDomain,
      connectionState: 'connected',
    };
  } catch (error) {
    const code = (error as {code?: string} | null)?.code || '';
    const message = error instanceof Error ? error.message : String(error);
    if (
      code === 'unavailable' ||
      message.includes('the client is offline') ||
      message.includes('unavailable')
    ) {
      console.error('Please check your Firebase configuration.', message);
      return {
        configured: true,
        projectId: FIREBASE_META.projectId,
        databaseId: FIREBASE_META.databaseId,
        authDomain: FIREBASE_META.authDomain,
        connectionState: 'offline',
        errorMessage: 'Klien sedang offline atau tidak dapat menjangkau Cloud Firestore.',
      };
    }

    if (code === 'permission-denied') {
      // Permission denied on /test/connection proves live round-trip to Firestore rules engine
      return {
        configured: true,
        projectId: FIREBASE_META.projectId,
        databaseId: FIREBASE_META.databaseId,
        authDomain: FIREBASE_META.authDomain,
        connectionState: 'connected',
      };
    }

    if (
      code === 'not-found' ||
      code === 'failed-precondition' ||
      code === 'invalid-argument' ||
      message.toLowerCase().includes('database')
    ) {
      return {
        configured: true,
        projectId: FIREBASE_META.projectId,
        databaseId: FIREBASE_META.databaseId,
        authDomain: FIREBASE_META.authDomain,
        connectionState: 'unconfigured',
        errorMessage: `Database Firestore "${FIREBASE_META.databaseId}" belum tersedia atau perlu konfigurasi.`,
      };
    }

    return {
      configured: true,
      projectId: FIREBASE_META.projectId,
      databaseId: FIREBASE_META.databaseId,
      authDomain: FIREBASE_META.authDomain,
      connectionState: 'unconfigured',
      errorMessage: message || 'Gagal memverifikasi koneksi Cloud Firestore.',
    };
  }
}

void verifyFirestoreConnection();
