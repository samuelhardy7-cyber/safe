import {auth} from '../firebase';
import {mapFirebaseAuthErrorDetails} from '../domain/authDiagnostics';

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

export function mapFirebaseAuthErrorID(error: unknown, currentHostname?: string): string {
  const host =
    currentHostname ?? (typeof window !== 'undefined' ? window.location.hostname : '');
  return mapFirebaseAuthErrorDetails(error, host).userMessage;
}
