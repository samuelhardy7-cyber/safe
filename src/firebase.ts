import {initializeApp, getApps, getApp} from 'firebase/app';
import {getAuth} from 'firebase/auth';
import {doc, getDocFromServer, getFirestore} from 'firebase/firestore';
import {getStorage} from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

export interface FirebaseStatusInfo {
  configured: boolean;
  projectId: string;
  databaseId: string;
  authDomain: string;
  connectionState: 'checking' | 'connected' | 'offline' | 'unconfigured';
  errorMessage?: string;
}

export const isFirebaseConfigured = Boolean(
  firebaseConfig &&
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.projectId !== 'remixed-project-id',
);

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const firebaseApp = app;
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const storage = getStorage(app);

export const FIREBASE_META = {
  projectId: firebaseConfig.projectId || '',
  databaseId: firebaseConfig.firestoreDatabaseId || '(default)',
  authDomain: firebaseConfig.authDomain || '',
};

export async function verifyFirestoreConnection(): Promise<FirebaseStatusInfo> {
  if (!isFirebaseConfigured) {
    return {
      configured: false,
      projectId: '',
      databaseId: '',
      authDomain: '',
      connectionState: 'unconfigured',
      errorMessage: 'Konfigurasi Firebase belum tersedia pada firebase-applet-config.json.',
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
