import {EMAIL_REGEX} from './validation.ts';

export type HostingEnvironment = 'development' | 'staging_preview' | 'production';

export type ProviderVerificationStatus =
  | 'unverified'
  | 'observed_active'
  | 'disabled_in_console'
  | 'domain_unauthorized';

export interface FirebaseConfigCandidate {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  firestoreDatabaseId?: string;
  measurementId?: string;
}

export interface FirebaseConfigIntegrityResult {
  valid: boolean;
  issues: string[];
  projectId: string;
  authDomain: string;
  databaseId: string;
  authDomainMatchesProject: boolean;
  authDomainIsHostingOverride: boolean;
}

export interface SafeAuthErrorDetails {
  code: string;
  userMessage: string;
  isDomainError: boolean;
  isContinueUriError: boolean;
  isPopupBlocked: boolean;
  isPopupClosed: boolean;
  isProviderDisabled: boolean;
  isNetworkError: boolean;
  isInvalidApiKey: boolean;
  safeTechnicalSummary: string;
}

export interface AuthDiagnosticEvent {
  code: string;
  action:
    | 'login_email'
    | 'register_email'
    | 'login_google_popup'
    | 'login_google_redirect'
    | 'password_reset'
    | 'email_verification'
    | 'reauth'
    | 'redirect_result';
  hostname: string;
  environment: HostingEnvironment;
  messageSummary: string;
  timestampIso: string;
  isDomainError: boolean;
  isPopupBlocked: boolean;
}

export function classifyHostingEnvironment(
  hostname: string,
  productionHosts: readonly string[] = [],
): HostingEnvironment {
  const host = (hostname || '').trim().toLowerCase();
  if (
    !host ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host.endsWith('.local')
  ) {
    return 'development';
  }

  const normalizedProd = productionHosts.map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (normalizedProd.includes(host)) {
    return 'production';
  }

  // Vercel git/branch preview URLs (e.g. app-git-branch-org.vercel.app) or AI Studio dev/pre previews
  if (
    host.includes('-git-') ||
    host.startsWith('ais-dev-') ||
    host.startsWith('ais-pre-') ||
    host.includes('.staging.') ||
    host.startsWith('staging.') ||
    host.startsWith('preview.')
  ) {
    return 'staging_preview';
  }

  return 'production';
}

export function getEnvironmentLabelID(env: HostingEnvironment): string {
  switch (env) {
    case 'development':
      return 'Development (Lokal)';
    case 'staging_preview':
      return 'Staging / Preview Deployment';
    case 'production':
      return 'Production Hosting';
  }
}

export function isDefaultFirebaseAuthorizedHostname(
  hostname: string,
  projectId: string,
): boolean {
  const host = (hostname || '').trim().toLowerCase();
  const pid = (projectId || '').trim().toLowerCase();
  if (!host) return false;
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') {
    return true;
  }
  if (pid && (host === `${pid}.firebaseapp.com` || host === `${pid}.web.app`)) {
    return true;
  }
  return false;
}

export function validateFirebaseConfigIntegrity(
  config: FirebaseConfigCandidate,
): FirebaseConfigIntegrityResult {
  const issues: string[] = [];
  const projectId = (config.projectId || '').trim();
  const authDomain = (config.authDomain || '').trim();
  const apiKey = (config.apiKey || '').trim();
  const appId = (config.appId || '').trim();
  const storageBucket = (config.storageBucket || '').trim();
  const messagingSenderId = (config.messagingSenderId || '').trim();
  const databaseId = (config.firestoreDatabaseId || '').trim() || '(default)';

  if (!projectId || projectId === 'remixed-project-id') {
    issues.push('projectId Firebase belum terkonfigurasi.');
  }
  if (!apiKey) {
    issues.push('apiKey Firebase belum terkonfigurasi.');
  }
  if (!authDomain) {
    issues.push('authDomain Firebase belum terkonfigurasi.');
  }
  if (!appId) {
    issues.push('appId Firebase belum terkonfigurasi.');
  }
  if (!messagingSenderId) {
    issues.push('messagingSenderId Firebase belum terkonfigurasi.');
  }

  const lowerAuthDomain = authDomain.toLowerCase();
  const authDomainIsHostingOverride =
    lowerAuthDomain.endsWith('.vercel.app') || lowerAuthDomain === 'localhost';

  if (authDomainIsHostingOverride) {
    issues.push(
      'authDomain tidak boleh diisi domain hosting Vercel/localhost kecuali menggunakan custom Auth reverse proxy resmi.',
    );
  }

  const expectedAuthDomain = projectId ? `${projectId.toLowerCase()}.firebaseapp.com` : '';
  const authDomainMatchesProject = Boolean(
    expectedAuthDomain && lowerAuthDomain === expectedAuthDomain,
  );

  if (projectId && storageBucket && !storageBucket.toLowerCase().includes(projectId.toLowerCase())) {
    issues.push('storageBucket tidak mengarah ke projectId yang sama.');
  }

  return {
    valid: issues.length === 0,
    issues,
    projectId,
    authDomain,
    databaseId,
    authDomainMatchesProject,
    authDomainIsHostingOverride,
  };
}

export function validateEmailAddressFormat(email: string): {valid: boolean; error?: string} {
  const trimmed = (email || '').trim();
  if (!trimmed) {
    return {valid: false, error: 'Masukkan alamat email terlebih dahulu.'};
  }
  if (trimmed.length > 200 || !EMAIL_REGEX.test(trimmed)) {
    return {valid: false, error: 'Format alamat email tidak valid.'};
  }
  return {valid: true};
}

export function buildAuthContinueUrl(origin: string): string | null {
  const raw = (origin || '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    return `${parsed.origin}/`;
  } catch {
    return null;
  }
}

export function shouldPreferGoogleRedirect(params: {
  isStandalone: boolean;
  isIOS: boolean;
  isInIframe: boolean;
  forceRedirect?: boolean;
}): boolean {
  if (params.forceRedirect) return true;
  if (params.isInIframe) return false;
  return params.isStandalone && params.isIOS;
}

export function extractFirebaseErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return String((error as {code: unknown}).code || '').trim();
  }
  if (error instanceof Error) {
    const match = error.message.match(/\((auth\/[a-z0-9-]+)\)/i);
    if (match?.[1]) return match[1];
  }
  return '';
}

export function redactSensitiveAuthText(text: string): string {
  return (text || '')
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, '[REDACTED_KEY]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/(refresh_token|access_token|id_token|client_secret)\s*[:=]\s*\S+/gi, '$1=[REDACTED]')
    .slice(0, 240);
}

export function mapFirebaseAuthErrorDetails(
  error: unknown,
  currentHostname = '',
): SafeAuthErrorDetails {
  const code = extractFirebaseErrorCode(error);
  const hostNote = currentHostname ? ` (${currentHostname})` : '';

  switch (code) {
    case 'auth/unauthorized-domain':
      return {
        code,
        userMessage:
          'Domain aplikasi belum diizinkan oleh sistem autentikasi. Silakan hubungi administrator.',
        isDomainError: true,
        isContinueUriError: false,
        isPopupBlocked: false,
        isPopupClosed: false,
        isProviderDisabled: false,
        isNetworkError: false,
        isInvalidApiKey: false,
        safeTechnicalSummary: `auth/unauthorized-domain: Hostname${hostNote} belum terdaftar pada Firebase Console > Authentication > Settings > Authorized domains.`,
      };
    case 'auth/unauthorized-continue-uri':
    case 'auth/invalid-continue-uri':
      return {
        code,
        userMessage:
          'Domain pengembalian tautan email belum diizinkan oleh sistem autentikasi. Silakan hubungi administrator.',
        isDomainError: true,
        isContinueUriError: true,
        isPopupBlocked: false,
        isPopupClosed: false,
        isProviderDisabled: false,
        isNetworkError: false,
        isInvalidApiKey: false,
        safeTechnicalSummary: `${code}: Continue URL${hostNote} belum terdaftar di Authorized domains Firebase Authentication.`,
      };
    case 'auth/popup-blocked':
      return {
        code,
        userMessage:
          'Jendela masuk Google diblokir oleh browser Anda. Izinkan popup atau gunakan mode redirect di bawah.',
        isDomainError: false,
        isContinueUriError: false,
        isPopupBlocked: true,
        isPopupClosed: false,
        isProviderDisabled: false,
        isNetworkError: false,
        isInvalidApiKey: false,
        safeTechnicalSummary: 'auth/popup-blocked: Popup OAuth diblokir oleh kebijakan browser.',
      };
    case 'auth/popup-closed-by-user':
      return {
        code,
        userMessage: 'Jendela masuk Google ditutup sebelum proses login selesai.',
        isDomainError: false,
        isContinueUriError: false,
        isPopupBlocked: false,
        isPopupClosed: true,
        isProviderDisabled: false,
        isNetworkError: false,
        isInvalidApiKey: false,
        safeTechnicalSummary: 'auth/popup-closed-by-user: Pengguna menutup popup Google Sign-In.',
      };
    case 'auth/cancelled-popup-request':
      return {
        code,
        userMessage: 'Permintaan masuk Google sebelumnya dibatalkan. Silakan coba lagi.',
        isDomainError: false,
        isContinueUriError: false,
        isPopupBlocked: false,
        isPopupClosed: true,
        isProviderDisabled: false,
        isNetworkError: false,
        isInvalidApiKey: false,
        safeTechnicalSummary: 'auth/cancelled-popup-request: Permintaan popup ganda dibatalkan.',
      };
    case 'auth/operation-not-allowed':
      return {
        code,
        userMessage:
          'Metode masuk ini belum diaktifkan pada layanan autentikasi. Silakan hubungi administrator.',
        isDomainError: false,
        isContinueUriError: false,
        isPopupBlocked: false,
        isPopupClosed: false,
        isProviderDisabled: true,
        isNetworkError: false,
        isInvalidApiKey: false,
        safeTechnicalSummary:
          'auth/operation-not-allowed: Provider login belum diaktifkan di Firebase Console > Authentication > Sign-in method.',
      };
    case 'auth/invalid-api-key':
    case 'auth/app-not-authorized':
      return {
        code,
        userMessage:
          'Konfigurasi autentikasi aplikasi belum valid. Silakan hubungi administrator.',
        isDomainError: false,
        isContinueUriError: false,
        isPopupBlocked: false,
        isPopupClosed: false,
        isProviderDisabled: false,
        isNetworkError: false,
        isInvalidApiKey: true,
        safeTechnicalSummary: `${code}: Konfigurasi Web API key / pembatasan HTTP referrer di Google Cloud tidak cocok.`,
      };
    case 'auth/network-request-failed':
      return {
        code,
        userMessage:
          'Koneksi ke server autentikasi terputus. Periksa jaringan internet Anda lalu coba kembali.',
        isDomainError: false,
        isContinueUriError: false,
        isPopupBlocked: false,
        isPopupClosed: false,
        isProviderDisabled: false,
        isNetworkError: true,
        isInvalidApiKey: false,
        safeTechnicalSummary: 'auth/network-request-failed: Gagal menghubungi endpoint Identity Toolkit.',
      };
    case 'auth/invalid-email':
      return {
        code,
        userMessage: 'Format alamat email tidak valid.',
        isDomainError: false,
        isContinueUriError: false,
        isPopupBlocked: false,
        isPopupClosed: false,
        isProviderDisabled: false,
        isNetworkError: false,
        isInvalidApiKey: false,
        safeTechnicalSummary: 'auth/invalid-email',
      };
    case 'auth/user-disabled':
      return {
        code,
        userMessage: 'Akun ini telah dinonaktifkan oleh administrator.',
        isDomainError: false,
        isContinueUriError: false,
        isPopupBlocked: false,
        isPopupClosed: false,
        isProviderDisabled: false,
        isNetworkError: false,
        isInvalidApiKey: false,
        safeTechnicalSummary: 'auth/user-disabled',
      };
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return {
        code,
        userMessage: 'Email atau kata sandi tidak sesuai.',
        isDomainError: false,
        isContinueUriError: false,
        isPopupBlocked: false,
        isPopupClosed: false,
        isProviderDisabled: false,
        isNetworkError: false,
        isInvalidApiKey: false,
        safeTechnicalSummary: code,
      };
    case 'auth/email-already-in-use':
      return {
        code,
        userMessage:
          'Alamat email ini sudah terdaftar. Silakan masuk atau gunakan pemulihan kata sandi.',
        isDomainError: false,
        isContinueUriError: false,
        isPopupBlocked: false,
        isPopupClosed: false,
        isProviderDisabled: false,
        isNetworkError: false,
        isInvalidApiKey: false,
        safeTechnicalSummary: 'auth/email-already-in-use',
      };
    case 'auth/weak-password':
      return {
        code,
        userMessage:
          'Kata sandi terlalu lemah. Gunakan minimal 8 karakter dengan kombinasi huruf besar, kecil, dan angka.',
        isDomainError: false,
        isContinueUriError: false,
        isPopupBlocked: false,
        isPopupClosed: false,
        isProviderDisabled: false,
        isNetworkError: false,
        isInvalidApiKey: false,
        safeTechnicalSummary: 'auth/weak-password',
      };
    case 'auth/too-many-requests':
      return {
        code,
        userMessage:
          'Terlalu banyak percobaan login. Silakan tunggu beberapa menit sebelum mencoba lagi.',
        isDomainError: false,
        isContinueUriError: false,
        isPopupBlocked: false,
        isPopupClosed: false,
        isProviderDisabled: false,
        isNetworkError: false,
        isInvalidApiKey: false,
        safeTechnicalSummary: 'auth/too-many-requests',
      };
    case 'auth/requires-recent-login':
      return {
        code,
        userMessage:
          'Tindakan sensitif memerlukan autentikasi ulang. Silakan verifikasi identitas Anda terlebih dahulu.',
        isDomainError: false,
        isContinueUriError: false,
        isPopupBlocked: false,
        isPopupClosed: false,
        isProviderDisabled: false,
        isNetworkError: false,
        isInvalidApiKey: false,
        safeTechnicalSummary: 'auth/requires-recent-login',
      };
    case 'auth/expired-action-code':
      return {
        code,
        userMessage: 'Tautan verifikasi atau reset kata sandi telah kedaluwarsa. Silakan ajukan tautan baru.',
        isDomainError: false,
        isContinueUriError: false,
        isPopupBlocked: false,
        isPopupClosed: false,
        isProviderDisabled: false,
        isNetworkError: false,
        isInvalidApiKey: false,
        safeTechnicalSummary: 'auth/expired-action-code',
      };
    case 'auth/invalid-action-code':
      return {
        code,
        userMessage: 'Kode verifikasi atau reset tidak valid atau sudah pernah digunakan.',
        isDomainError: false,
        isContinueUriError: false,
        isPopupBlocked: false,
        isPopupClosed: false,
        isProviderDisabled: false,
        isNetworkError: false,
        isInvalidApiKey: false,
        safeTechnicalSummary: 'auth/invalid-action-code',
      };
    case 'auth/account-exists-with-different-credential':
      return {
        code,
        userMessage:
          'Email ini sudah terdaftar menggunakan metode masuk lain. Gunakan metode masuk awal Anda.',
        isDomainError: false,
        isContinueUriError: false,
        isPopupBlocked: false,
        isPopupClosed: false,
        isProviderDisabled: false,
        isNetworkError: false,
        isInvalidApiKey: false,
        safeTechnicalSummary: 'auth/account-exists-with-different-credential',
      };
    default: {
      const rawMsg = error instanceof Error ? error.message : String(error || '');
      const cleanMessage =
        rawMsg && !rawMsg.includes('Firebase:') && !rawMsg.includes('auth/')
          ? redactSensitiveAuthText(rawMsg)
          : 'Gagal memproses autentikasi. Silakan coba lagi atau periksa diagnostik autentikasi.';
      return {
        code: code || 'auth/unknown',
        userMessage: cleanMessage,
        isDomainError: false,
        isContinueUriError: false,
        isPopupBlocked: false,
        isPopupClosed: false,
        isProviderDisabled: false,
        isNetworkError: false,
        isInvalidApiKey: false,
        safeTechnicalSummary: code
          ? `${code}: ${redactSensitiveAuthText(rawMsg)}`
          : redactSensitiveAuthText(rawMsg || 'Unknown authentication error'),
      };
    }
  }
}
