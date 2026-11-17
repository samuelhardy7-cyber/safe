import React, {useState} from 'react';
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Globe,
  ShieldCheck,
  X,
} from 'lucide-react';
import {useAuth} from '../../contexts/AuthContext';
import {
  classifyHostingEnvironment,
  getEnvironmentLabelID,
  isDefaultFirebaseAuthorizedHostname,
  type ProviderVerificationStatus,
} from '../../domain/authDiagnostics';
import {FIREBASE_CONFIG_AUDIT, FIREBASE_META, type FirebaseStatusInfo} from '../../firebase';

interface AuthDiagnosticModalProps {
  open: boolean;
  fbStatus: FirebaseStatusInfo;
  onClose: () => void;
}

function getProviderLabel(
  status: ProviderVerificationStatus,
  kind: 'email' | 'google',
  hasOAuthClientId: boolean,
): {text: string; tone: 'success' | 'warning' | 'danger' | 'neutral'} {
  switch (status) {
    case 'observed_active':
      return {text: 'Teramati Aktif (Terverifikasi Sesi)', tone: 'success'};
    case 'disabled_in_console':
      return {
        text: 'Nonaktif di Firebase Console (auth/operation-not-allowed)',
        tone: 'danger',
      };
    case 'domain_unauthorized':
      return {
        text: 'Ditolak karena Hostname Belum Diotorisasi (auth/unauthorized-domain)',
        tone: 'danger',
      };
    case 'unverified':
    default:
      if (kind === 'google') {
        return {
          text: hasOAuthClientId
            ? 'OAuth Client Terdaftar — Status Console Belum Diverifikasi'
            : 'Status Console Belum Diverifikasi',
          tone: 'neutral',
        };
      }
      return {
        text: 'Status Console Belum Dapat Diverifikasi Otomatis',
        tone: 'neutral',
      };
  }
}

export const AuthDiagnosticModal: React.FC<AuthDiagnosticModalProps> = ({
  open,
  fbStatus,
  onClose,
}) => {
  const {lastAuthDiagnostic, providerStatus} = useAuth();
  const [copiedHost, setCopiedHost] = useState(false);

  if (!open) return null;

  const currentHostname = typeof window !== 'undefined' ? window.location.hostname : 'unknown';
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const envType = classifyHostingEnvironment(currentHostname);
  const envLabel = getEnvironmentLabelID(envType);
  const isDefaultHost = isDefaultFirebaseAuthorizedHostname(
    currentHostname,
    FIREBASE_META.projectId,
  );

  const emailObs = getProviderLabel(
    providerStatus.emailPassword,
    'email',
    FIREBASE_META.hasOAuthClientId,
  );
  const googleObs = getProviderLabel(
    providerStatus.google,
    'google',
    FIREBASE_META.hasOAuthClientId,
  );

  const handleCopyHost = async () => {
    try {
      await navigator.clipboard.writeText(currentHostname);
      setCopiedHost(true);
      window.setTimeout(() => setCopiedHost(false), 2000);
    } catch {
      // Clipboard blocked in restricted browser
    }
  };

  const badgeClass = (tone: 'success' | 'warning' | 'danger' | 'neutral') => {
    if (tone === 'success') {
      return 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800';
    }
    if (tone === 'danger') {
      return 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800';
    }
    if (tone === 'warning') {
      return 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800';
    }
    return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-[1px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-diag-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
          <div className="flex items-start gap-2.5">
            <Activity className="mt-0.5 h-5 w-5 shrink-0 text-violet-700 dark:text-violet-400" />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-400">
                Administrator Teknis · Tanpa Secret/Token
              </p>
              <h2
                id="auth-diag-title"
                className="mt-0.5 font-display text-lg font-semibold text-slate-900 dark:text-slate-100"
              >
                Diagnostik Autentikasi &amp; Domain Firebase
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup panel diagnostik autentikasi"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Core Environment & Firebase Identity Table */}
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs dark:border-slate-800 dark:bg-slate-950">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Current Browser Hostname
              </dt>
              <dd className="mt-1 flex items-center gap-2 font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                <span className="truncate">{currentHostname}</span>
                <button
                  type="button"
                  onClick={() => void handleCopyHost()}
                  className="inline-flex shrink-0 items-center gap-1 rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-sans font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  {copiedHost ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-600" />
                      Tersalin
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      Salin
                    </>
                  )}
                </button>
              </dd>
              <p className="mt-0.5 truncate font-mono text-[10px] text-slate-500 dark:text-slate-400">
                Origin: {currentOrigin}
              </p>
            </div>

            <div>
              <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Environment Name
              </dt>
              <dd className="mt-1 font-medium text-slate-900 dark:text-slate-100">{envLabel}</dd>
              <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                {isDefaultHost
                  ? 'Hostname bawaan Firebase/Localhost'
                  : 'Hostname eksternal (wajib terdaftar di Authorized Domains)'}
              </p>
            </div>

            <div>
              <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Firebase Project ID
              </dt>
              <dd className="mt-1 font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                {FIREBASE_META.projectId || 'Belum diatur'}
              </dd>
              <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                Sumber: {FIREBASE_META.configSource}
              </p>
            </div>

            <div>
              <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Firebase Auth Domain
              </dt>
              <dd className="mt-1 font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                {FIREBASE_META.authDomain || 'Belum diatur'}
              </dd>
              <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                {FIREBASE_CONFIG_AUDIT.authDomainMatchesProject
                  ? 'Sesuai dengan projectId Firebase'
                  : 'Custom / berbeda dari default .firebaseapp.com'}
              </p>
            </div>

            <div>
              <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Auth Initialization Status
              </dt>
              <dd className="mt-1 flex items-center gap-1.5 font-medium text-slate-900 dark:text-slate-100">
                {FIREBASE_META.authInitialized && FIREBASE_CONFIG_AUDIT.valid ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Terinisialisasi (Single App Instance)</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                    <span>Konfigurasi Bermasalah</span>
                  </>
                )}
              </dd>
            </div>

            <div>
              <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Cloud Firestore Status
              </dt>
              <dd className="mt-1 font-mono text-xs text-slate-900 dark:text-slate-100">
                {fbStatus.connectionState}
              </dd>
            </div>
          </dl>
        </div>

        {/* Provider Verification Status */}
        <div className="mt-4 space-y-2.5">
          <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            Status Provider Autentikasi (Observasi Runtime Jujur)
          </h3>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Email / Password Provider
              </p>
              <span
                className={`mt-1.5 inline-block rounded-md border px-2 py-1 text-[11px] font-medium ${badgeClass(emailObs.tone)}`}
              >
                {emailObs.text}
              </span>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Google Sign-In Provider
              </p>
              <span
                className={`mt-1.5 inline-block rounded-md border px-2 py-1 text-[11px] font-medium ${badgeClass(googleObs.tone)}`}
              >
                {googleObs.text}
              </span>
            </div>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            Catatan: Firebase Client SDK tidak mengekspos status aktif Console sebelum percobaan
            login/pendaftaran dilakukan. Status di atas hanya menandai aktif bila benar-benar
            teramati oleh respons Firebase Auth.
          </p>
        </div>

        {/* Last Authentication Error Log (Secret-Free) */}
        <div className="mt-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              Log Error Autentikasi Terakhir (Tanpa Data Sensitif)
            </h3>
            {lastAuthDiagnostic && (
              <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                {lastAuthDiagnostic.timestampIso}
              </span>
            )}
          </div>
          {lastAuthDiagnostic ? (
            <div className="mt-2.5 space-y-1.5 font-mono text-[11px] text-rose-800 dark:text-rose-300">
              <p>
                <strong>Kode Error:</strong> {lastAuthDiagnostic.code} (aksi:{' '}
                {lastAuthDiagnostic.action})
              </p>
              <p>
                <strong>Hostname:</strong> {lastAuthDiagnostic.hostname}
              </p>
              <p className="font-sans text-xs text-slate-700 dark:text-slate-300">
                {lastAuthDiagnostic.messageSummary}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Belum ada error autentikasi yang tercatat pada sesi browser ini.
            </p>
          )}
        </div>

        {/* Actionable Instructions for Vercel / Production Domain Authorization */}
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs leading-relaxed text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-200">
          <div className="flex items-center gap-2 font-semibold">
            <Globe className="h-4 w-4 shrink-0" />
            <span>Cara Memperbaiki auth/unauthorized-domain pada Vercel / Custom Domain</span>
          </div>
          <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-[11px]">
            <li>
              Buka <strong>Firebase Console</strong> → project{' '}
              <code className="rounded bg-white/70 px-1 py-0.5 dark:bg-slate-900">
                {FIREBASE_META.projectId}
              </code>
              .
            </li>
            <li>
              Masuk ke <strong>Authentication → Settings → Authorized domains → Add domain</strong>.
            </li>
            <li>
              Tambahkan hostname aktif berikut secara persis (tanpa{' '}
              <code>https://</code> dan tanpa wildcard):{' '}
              <code className="rounded bg-white/70 px-1 py-0.5 font-semibold dark:bg-slate-900">
                {currentHostname}
              </code>
              .
            </li>
            <li>
              Tetap pertahankan <code className="font-mono">authDomain</code> pada{' '}
              <code className="font-mono">{FIREBASE_META.authDomain}</code> (jangan diubah ke
              domain Vercel kecuali Anda mengonfigurasi reverse proxy auth khusus).
            </li>
            <li>
              Di <strong>Google Cloud Console → APIs &amp; Services → Credentials</strong>, pastikan
              OAuth 2.0 Web Client memiliki redirect URI{' '}
              <code className="rounded bg-white/70 px-1 py-0.5 dark:bg-slate-900">
                https://{FIREBASE_META.authDomain}/__/auth/handler
              </code>
              .
            </li>
          </ol>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            Kata sandi, private key, dan token sesi tidak pernah ditampilkan.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-[#0F1E36] px-4 py-2 text-xs font-medium text-white hover:bg-[#162A4A] dark:bg-violet-700 dark:hover:bg-violet-600"
          >
            Tutup Diagnostik
          </button>
        </div>
      </div>
    </div>
  );
};
