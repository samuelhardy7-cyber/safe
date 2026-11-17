import {auth} from '../firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function extractUserErrorMessage(error: unknown, fallback = 'Terjadi kesalahan operasi.'): string {
  if (!(error instanceof Error)) return fallback;
  try {
    const parsed = JSON.parse(error.message) as Partial<FirestoreErrorInfo>;
    if (parsed.error) {
      if (parsed.error.toLowerCase().includes('permission') || parsed.error.toLowerCase().includes('insufficient')) {
        return 'Akses ditolak oleh kebijakan keamanan database. Pastikan email terverifikasi dan peran gereja Anda sesuai.';
      }
      return parsed.error;
    }
  } catch {
    // Standard error message
  }
  return error.message || fallback;
}

export function mapFirebaseAuthErrorID(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as {code: unknown}).code)
      : '';

  switch (code) {
    case 'auth/invalid-email':
      return 'Format alamat email tidak valid.';
    case 'auth/user-disabled':
      return 'Akun ini telah dinonaktifkan oleh administrator.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Email atau kata sandi tidak sesuai.';
    case 'auth/email-already-in-use':
      return 'Alamat email ini sudah terdaftar. Silakan masuk atau gunakan reset kata sandi.';
    case 'auth/weak-password':
      return 'Kata sandi terlalu lemah. Gunakan minimal 8 karakter dengan kombinasi huruf besar, kecil, dan angka.';
    case 'auth/too-many-requests':
      return 'Terlalu banyak percobaan login. Silakan tunggu beberapa menit sebelum mencoba lagi.';
    case 'auth/popup-closed-by-user':
      return 'Jendela masuk Google ditutup sebelum proses selesai.';
    case 'auth/popup-blocked':
      return 'Popup browser diblokir. Izinkan popup untuk melanjutkan Google Sign-In.';
    case 'auth/requires-recent-login':
      return 'Tindakan sensitif memerlukan autentikasi ulang. Silakan verifikasi identitas Anda terlebih dahulu.';
    case 'auth/operation-not-allowed':
      return 'Provider login Email/Password belum diaktifkan di Firebase Console (Authentication > Sign-in method). Aktifkan provider tersebut atau gunakan Google Sign-In.';
    case 'auth/expired-action-code':
      return 'Tautan verifikasi atau reset kata sandi telah kedaluwarsa. Silakan ajukan tautan baru.';
    case 'auth/invalid-action-code':
      return 'Kode tindakan tidak valid atau sudah pernah digunakan.';
    default:
      return error instanceof Error ? error.message : 'Gagal memproses autentikasi.';
  }
}
