import React, {useEffect, useState} from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  HelpCircle,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Moon,
  Shield,
  Smartphone,
  Sun,
  User as UserIcon,
  X,
} from 'lucide-react';
import {useAuth} from '../../contexts/AuthContext';
import {useTheme} from '../../contexts/ThemeContext';
import {validateEmailAddressFormat} from '../../domain/authDiagnostics';
import {validatePasswordStrength, validateProfileInput} from '../../domain/validation';
import {
  FIREBASE_META,
  isFirebaseConfigured,
  verifyFirestoreConnection,
  type FirebaseStatusInfo,
} from '../../firebase';
import {InstallHigayonModal, PWAInstallButton} from '../pwa/PWAControls';
import {AuthDiagnosticModal} from './AuthDiagnosticModal';

type AuthTab = 'login' | 'register' | 'forgot';

export const AuthPortal: React.FC = () => {
  const {
    actionLink,
    lastAuthDiagnostic,
    redirectAuthError,
    clearActionLink,
    clearRedirectAuthError,
    loginWithEmail,
    registerWithEmail,
    loginWithGoogle,
    requestPasswordReset,
    verifyResetCode,
    completePasswordReset,
    completeEmailVerificationCode,
  } = useAuth();
  const {theme, toggleTheme} = useTheme();

  const [tab, setTab] = useState<AuthTab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resetEmailTarget, setResetEmailTarget] = useState<string | null>(null);
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [showDiagnosticModal, setShowDiagnosticModal] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [fbStatus, setFbStatus] = useState<FirebaseStatusInfo>({
    configured: isFirebaseConfigured,
    projectId: FIREBASE_META.projectId,
    databaseId: FIREBASE_META.databaseId,
    authDomain: FIREBASE_META.authDomain,
    connectionState: 'checking',
  });

  useEffect(() => {
    void verifyFirestoreConnection().then(setFbStatus);
  }, []);

  useEffect(() => {
    if (redirectAuthError) {
      setError(redirectAuthError);
    }
  }, [redirectAuthError]);

  // Handle Firebase Action Links (resetPassword or verifyEmail from URL query params)
  useEffect(() => {
    if (!actionLink.mode || !actionLink.oobCode) return;

    if (actionLink.mode === 'resetPassword') {
      void verifyResetCode(actionLink.oobCode)
        .then((targetEmail) => {
          setResetEmailTarget(targetEmail);
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Kode reset sandi tidak valid.');
          clearActionLink();
        });
    } else if (actionLink.mode === 'verifyEmail') {
      void completeEmailVerificationCode(actionLink.oobCode)
        .then(() => {
          setNotice('Email Anda berhasil diverifikasi. Silakan masuk menggunakan akun Anda.');
          clearActionLink();
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Verifikasi email gagal.');
          clearActionLink();
        });
    }
  }, [actionLink, verifyResetCode, completeEmailVerificationCode, clearActionLink]);

  const switchTab = (nextTab: AuthTab) => {
    if (submitting) return;
    setTab(nextTab);
    setError(null);
    setNotice(null);
    clearRedirectAuthError();
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setNotice(null);
    clearRedirectAuthError();

    const emailCheck = validateEmailAddressFormat(email);
    if (!emailCheck.valid) {
      setError(emailCheck.error || 'Format alamat email tidak valid.');
      return;
    }
    if (!password) {
      setError('Masukkan kata sandi akun Anda.');
      return;
    }

    setSubmitting(true);
    try {
      await loginWithEmail(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk ke ruang kerja.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setNotice(null);
    clearRedirectAuthError();

    const profileCheck = validateProfileInput({displayName});
    if (!profileCheck.valid) {
      setError(profileCheck.error || 'Nama lengkap wajib diisi (2–120 karakter).');
      return;
    }
    const emailCheck = validateEmailAddressFormat(email);
    if (!emailCheck.valid) {
      setError(emailCheck.error || 'Format alamat email tidak valid.');
      return;
    }
    const passCheck = validatePasswordStrength(password);
    if (!passCheck.valid) {
      setError(passCheck.error || 'Kata sandi belum memenuhi standar keamanan.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Konfirmasi kata sandi tidak cocok.');
      return;
    }

    setSubmitting(true);
    try {
      await registerWithEmail(email, password, displayName);
      setNotice('Akun dibuat. Tautan verifikasi email telah dikirim ke kotak masuk Anda.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mendaftarkan akun.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setNotice(null);
    clearRedirectAuthError();

    const emailCheck = validateEmailAddressFormat(email);
    if (!emailCheck.valid) {
      setError(emailCheck.error || 'Masukkan alamat email yang valid.');
      return;
    }

    setSubmitting(true);
    try {
      await requestPasswordReset(email);
      setNotice(
        'Jika alamat email terdaftar, tautan untuk mengatur ulang kata sandi telah dikirimkan.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengirim email reset kata sandi.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || !actionLink.oobCode) return;
    setError(null);
    setNotice(null);

    const passCheck = validatePasswordStrength(password);
    if (!passCheck.valid) {
      setError(passCheck.error || 'Kata sandi baru belum memenuhi standar keamanan.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Konfirmasi kata sandi baru tidak cocok.');
      return;
    }

    setSubmitting(true);
    try {
      await completePasswordReset(actionLink.oobCode, password);
      setResetEmailTarget(null);
      clearActionLink();
      setPassword('');
      setConfirmPassword('');
      setTab('login');
      setNotice('Kata sandi baru berhasil disimpan. Silakan masuk dengan kata sandi baru Anda.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengatur ulang kata sandi.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async (useRedirect = false) => {
    if (submitting) return;
    setError(null);
    setNotice(null);
    clearRedirectAuthError();
    setSubmitting(true);
    try {
      await loginWithGoogle({useRedirect});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk dengan Google.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 lg:grid lg:grid-cols-12 dark:bg-slate-950">
      {/* Left Brand & Security Architecture Column */}
      <aside className="order-2 flex flex-col justify-between bg-[#0F1E36] px-6 py-8 text-slate-100 lg:order-1 lg:col-span-5 lg:px-12 lg:py-12">
        <div>
          <div className="hidden items-center justify-between gap-4 lg:flex">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-amber-500/40 bg-[#162A4A]">
                <Shield className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <p className="font-display text-sm font-semibold tracking-wide text-white">
                  HIGAYON
                </p>
                <p className="text-xs text-blue-200/80">Church Management</p>
              </div>
            </div>
            <PWAInstallButton />
          </div>

          <div className="max-w-md lg:mt-12">
            <p className="text-xs font-medium tracking-wide text-amber-300">
              Private Congregation &amp; Financial Management System
            </p>
            <h1 className="mt-3 font-display text-3xl font-semibold leading-tight text-white [text-wrap:balance]">
              Administrasi gereja terisolasi dengan kontrol akses berbasis peran.
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-slate-300">
              Dirancang khusus untuk melindungi kerahasiaan data jemaat dan akuntabilitas pengelolaan
              keuangan di setiap gereja dalam satu platform terpadu.
            </p>
          </div>

          <dl className="mt-10 space-y-5 border-t border-white/10 pt-8 text-sm">
            <div>
              <dt className="font-medium text-white">Manajemen Jemaat Rahasia</dt>
              <dd className="mt-1 text-xs leading-relaxed text-slate-300">
                Data pribadi dan riwayat jemaat hanya dapat diakses oleh Church Owner yang sah pada
                gereja terkait.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-white">Manajemen Keuangan Terkontrol</dt>
              <dd className="mt-1 text-xs leading-relaxed text-slate-300">
                Akses pemasukan, pengeluaran, dan laporan keuangan hanya diberikan kepada Owner dan
                staf keuangan dengan izin eksplisit.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-white">Isolasi Multi-Gereja &amp; Audit Trail</dt>
              <dd className="mt-1 text-xs leading-relaxed text-slate-300">
                Setiap perubahan izin dan aktivitas administratif tercatat pada log audit yang tidak
                dapat diubah dan terpisah per gereja.
              </dd>
            </div>
          </dl>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-white/10 pt-5 text-xs text-slate-300 lg:mt-10 lg:pt-6">
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span>
              {fbStatus.connectionState === 'connected'
                ? 'Firebase Terhubung'
                : fbStatus.connectionState === 'checking'
                  ? 'Memeriksa Koneksi...'
                  : 'Perlu Konfigurasi'}
            </span>
            {fbStatus.projectId && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-[11px] text-slate-400">{fbStatus.projectId}</span>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              type="button"
              onClick={() => setShowInstallGuide(true)}
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-blue-200 underline-offset-4 hover:text-white hover:underline"
            >
              <Smartphone className="h-3.5 w-3.5" />
              Panduan Install Higayon
            </button>
            <button
              type="button"
              onClick={() => setShowSetupGuide(true)}
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-blue-200 underline-offset-4 hover:text-white hover:underline"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              Petunjuk Konfigurasi
            </button>
            <button
              type="button"
              onClick={() => setShowDiagnosticModal(true)}
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-blue-200 underline-offset-4 hover:text-white hover:underline"
            >
              <Activity className="h-3.5 w-3.5" />
              Diagnostik Auth
            </button>
          </div>
        </div>
      </aside>

      {/* Right Authentication Form Area */}
      <main className="order-1 flex flex-1 flex-col items-center justify-center px-4 py-8 sm:px-6 lg:order-2 lg:col-span-7 lg:px-12 lg:py-12">
        <div className="mb-5 flex w-full max-w-md items-center justify-between lg:hidden">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0F1E36] text-amber-400">
              <Shield className="h-4 w-4" />
            </div>
            <div>
              <p className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                HIGAYON
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Church Management</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Ubah ke Mode Terang' : 'Ubah ke Mode Gelap'}
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4 text-amber-400" />
              ) : (
                <Moon className="h-4 w-4 text-slate-600" />
              )}
            </button>
            <PWAInstallButton />
          </div>
        </div>
        <div className="mb-3 hidden w-full max-w-md justify-end lg:flex">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Ubah ke Mode Terang' : 'Ubah ke Mode Gelap'}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="h-3.5 w-3.5 text-amber-400" />
                <span>Mode Terang</span>
              </>
            ) : (
              <>
                <Moon className="h-3.5 w-3.5 text-slate-600" />
                <span>Mode Gelap</span>
              </>
            )}
          </button>
        </div>
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 sm:p-8 dark:border-slate-800 dark:bg-slate-900">
          {actionLink.mode === 'resetPassword' && resetEmailTarget ? (
            <div>
              <div className="flex items-center gap-2.5 text-[#0F1E36] dark:text-slate-100">
                <KeyRound className="h-5 w-5 text-violet-700 dark:text-violet-400" />
                <h2 className="font-display text-xl font-semibold">Atur Ulang Kata Sandi</h2>
              </div>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                Buat kata sandi baru untuk akun{' '}
                <strong className="text-slate-900 dark:text-slate-100">{resetEmailTarget}</strong>.
              </p>

              <form onSubmit={(e) => void handleConfirmReset(e)} noValidate className="mt-6 space-y-4">
                <div>
                  <label
                    htmlFor="reset-pass"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Kata Sandi Baru
                  </label>
                  <div className="relative mt-1.5">
                    <input
                      id="reset-pass"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimal 8 karakter, huruf besar, kecil & angka"
                      autoComplete="new-password"
                      className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-3.5 pr-10 text-sm text-slate-900 focus:border-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-600/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="reset-pass-confirm"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Konfirmasi Kata Sandi Baru
                  </label>
                  <input
                    id="reset-pass-confirm"
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Ulangi kata sandi baru"
                    autoComplete="new-password"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-600/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>

                {error && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/50 dark:text-rose-200"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => {
                      clearActionLink();
                      setResetEmailTarget(null);
                    }}
                    className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#0F1E36] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#162A4A] disabled:opacity-60 dark:bg-violet-700 dark:hover:bg-violet-600"
                  >
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    {submitting ? 'Menyimpan...' : 'Simpan Kata Sandi'}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <>
              <div>
                <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-slate-100">
                  {tab === 'login' && 'Masuk ke Ruang Kerja Gereja'}
                  {tab === 'register' && 'Buat Akun Administrasi'}
                  {tab === 'forgot' && 'Pemulihan Kata Sandi'}
                </h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  {tab === 'login' &&
                    'Gunakan akun terverifikasi untuk membuka ruang kerja gereja Anda.'}
                  {tab === 'register' &&
                    'Daftarkan akun baru untuk membuat ruang kerja gereja atau menerima undangan.'}
                  {tab === 'forgot' &&
                    'Kami akan mengirimkan tautan pemulihan kata sandi ke email terdaftar.'}
                </p>
              </div>

              {/* Segmented Tab Switcher */}
              <div
                role="tablist"
                aria-label="Mode Autentikasi"
                className="mt-6 grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'login'}
                  onClick={() => switchTab('login')}
                  className={`rounded-md px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                    tab === 'login'
                      ? 'bg-white text-[#0F1E36] shadow-sm dark:bg-slate-900 dark:text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                  }`}
                >
                  Masuk
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'register'}
                  onClick={() => switchTab('register')}
                  className={`rounded-md px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                    tab === 'register'
                      ? 'bg-white text-[#0F1E36] shadow-sm dark:bg-slate-900 dark:text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                  }`}
                >
                  Daftar Akun
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'forgot'}
                  onClick={() => switchTab('forgot')}
                  className={`rounded-md px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                    tab === 'forgot'
                      ? 'bg-white text-[#0F1E36] shadow-sm dark:bg-slate-900 dark:text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                  }`}
                >
                  Lupa Sandi
                </button>
              </div>

              {error && (
                <div
                  role="alert"
                  className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs leading-relaxed text-rose-800 dark:border-rose-900/70 dark:bg-rose-950/50 dark:text-rose-200"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                    <span className="flex-1">{error}</span>
                  </div>
                  {(lastAuthDiagnostic?.isDomainError || lastAuthDiagnostic?.isPopupBlocked) && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-6">
                      {lastAuthDiagnostic?.isPopupBlocked && (
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => void handleGoogleSignIn(true)}
                          className="rounded-md bg-[#0F1E36] px-2.5 py-1 text-[11px] font-medium text-white hover:bg-[#162A4A] dark:bg-violet-700 dark:hover:bg-violet-600"
                        >
                          Gunakan Mode Redirect Google
                        </button>
                      )}
                      {lastAuthDiagnostic?.isDomainError && (
                        <button
                          type="button"
                          onClick={() => setShowDiagnosticModal(true)}
                          className="rounded-md border border-rose-300 bg-white px-2.5 py-1 text-[11px] font-medium text-rose-800 hover:bg-rose-100 dark:border-rose-700 dark:bg-slate-900 dark:text-rose-200"
                        >
                          Buka Diagnostik Admin
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {notice && (
                <div
                  role="status"
                  className="mt-5 flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/50 dark:text-emerald-200"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span>{notice}</span>
                </div>
              )}

              {tab === 'login' && (
                <form onSubmit={(e) => void handleLogin(e)} noValidate className="mt-5 space-y-4">
                  <div>
                    <label
                      htmlFor="login-email"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      Alamat Email
                    </label>
                    <div className="relative mt-1.5">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        id="login-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="nama@gereja.org"
                        autoComplete="email"
                        className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3.5 text-sm text-slate-900 focus:border-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-600/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="login-password"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      Kata Sandi
                    </label>
                    <div className="relative mt-1.5">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Masukkan kata sandi"
                        autoComplete="current-password"
                        className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-10 text-sm text-slate-900 focus:border-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-600/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0F1E36] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#162A4A] disabled:opacity-60 dark:bg-violet-700 dark:hover:bg-violet-600"
                  >
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    {submitting ? 'Memproses...' : 'Masuk dengan Email'}
                  </button>
                </form>
              )}

              {tab === 'register' && (
                <form
                  onSubmit={(e) => void handleRegister(e)}
                  noValidate
                  className="mt-5 space-y-4"
                >
                  <div>
                    <label
                      htmlFor="reg-name"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      Nama Lengkap
                    </label>
                    <div className="relative mt-1.5">
                      <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        id="reg-name"
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Contoh: Pdt. Daniel Wijaya"
                        autoComplete="name"
                        className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3.5 text-sm text-slate-900 focus:border-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-600/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="reg-email"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      Alamat Email
                    </label>
                    <div className="relative mt-1.5">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        id="reg-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="nama@gereja.org"
                        autoComplete="email"
                        className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3.5 text-sm text-slate-900 focus:border-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-600/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="reg-password"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      Kata Sandi
                    </label>
                    <div className="relative mt-1.5">
                      <input
                        id="reg-password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Min. 8 karakter (huruf besar, kecil, angka)"
                        autoComplete="new-password"
                        className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-3.5 pr-10 text-sm text-slate-900 focus:border-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-600/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="reg-confirm"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      Konfirmasi Kata Sandi
                    </label>
                    <input
                      id="reg-confirm"
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Ulangi kata sandi"
                      autoComplete="new-password"
                      className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-600/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0F1E36] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#162A4A] disabled:opacity-60 dark:bg-violet-700 dark:hover:bg-violet-600"
                  >
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    {submitting ? 'Mendaftarkan...' : 'Daftar & Kirim Verifikasi Email'}
                  </button>
                </form>
              )}

              {tab === 'forgot' && (
                <form onSubmit={(e) => void handleForgot(e)} noValidate className="mt-5 space-y-4">
                  <div>
                    <label
                      htmlFor="forgot-email"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      Alamat Email Terdaftar
                    </label>
                    <div className="relative mt-1.5">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        id="forgot-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="nama@gereja.org"
                        autoComplete="email"
                        className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3.5 text-sm text-slate-900 focus:border-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-600/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0F1E36] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#162A4A] disabled:opacity-60 dark:bg-violet-700 dark:hover:bg-violet-600"
                  >
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    {submitting ? 'Mengirim Tautan...' : 'Kirim Tautan Reset Kata Sandi'}
                  </button>
                </form>
              )}

              {tab !== 'forgot' && (
                <div className="mt-6">
                  <div className="relative flex items-center py-2">
                    <div className="grow border-t border-slate-200 dark:border-slate-800" />
                    <span className="mx-3 shrink-0 text-xs text-slate-400">atau</span>
                    <div className="grow border-t border-slate-200 dark:border-slate-800" />
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleGoogleSignIn(false)}
                    disabled={submitting}
                    className="mt-2 flex w-full items-center justify-center gap-2.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          fill="#4285F4"
                          d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                        />
                      </svg>
                    )}
                    Lanjutkan dengan Google Sign-In
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* Firebase Configuration & Setup Instructions Modal */}
      {showSetupGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="fb-guide-title"
            className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3
                  id="fb-guide-title"
                  className="font-display text-base font-semibold text-slate-900 dark:text-slate-100"
                >
                  Status &amp; Petunjuk Konfigurasi Firebase
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Higayon Church Management menggunakan Cloud Firestore &amp; Firebase Auth.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSetupGuide(false)}
                aria-label="Tutup petunjuk konfigurasi"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs text-slate-600 dark:text-slate-300">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 font-mono dark:border-slate-800 dark:bg-slate-950">
                <div className="flex justify-between gap-4 py-1">
                  <span className="text-slate-500 dark:text-slate-400">Project ID</span>
                  <span className="text-slate-900 dark:text-slate-100">
                    {fbStatus.projectId || 'Belum diatur'}
                  </span>
                </div>
                <div className="flex justify-between gap-4 py-1">
                  <span className="text-slate-500 dark:text-slate-400">Auth Domain</span>
                  <span className="text-slate-900 dark:text-slate-100">
                    {fbStatus.authDomain || 'Belum diatur'}
                  </span>
                </div>
                <div className="flex justify-between gap-4 py-1">
                  <span className="text-slate-500 dark:text-slate-400">Database ID</span>
                  <span className="text-slate-900 dark:text-slate-100">
                    {fbStatus.databaseId || '(default)'}
                  </span>
                </div>
                <div className="flex justify-between gap-4 py-1">
                  <span className="text-slate-500 dark:text-slate-400">Status Firestore</span>
                  <span className="text-slate-900 dark:text-slate-100">
                    {fbStatus.connectionState}
                  </span>
                </div>
              </div>

              <div className="space-y-2 leading-relaxed">
                <p className="font-medium text-slate-900 dark:text-slate-100">
                  Langkah Mengaktifkan Domain Hosting, Email/Password &amp; MFA:
                </p>
                <ol className="list-decimal space-y-1.5 pl-4">
                  <li>
                    Buka <strong>Firebase Console</strong> dan pilih project{' '}
                    <code className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">
                      {fbStatus.projectId}
                    </code>
                    .
                  </li>
                  <li>
                    Masuk ke <strong>Authentication &gt; Settings &gt; Authorized domains</strong>{' '}
                    dan tambahkan domain Vercel/produksi Anda secara spesifik.
                  </li>
                  <li>
                    Masuk ke <strong>Authentication &gt; Sign-in method</strong> lalu aktifkan{' '}
                    <strong>Email/Password</strong> dan pastikan <strong>Google</strong> aktif.
                  </li>
                  <li>
                    Untuk perlindungan Owner dan Finance Approver, aktifkan{' '}
                    <strong>Multi-factor authentication</strong> pada tab Authentication Settings.
                  </li>
                  <li>
                    Jangan pernah menyimpan Service Account JSON atau private key di aplikasi
                    frontend.
                  </li>
                </ol>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowSetupGuide(false);
                  setShowDiagnosticModal(true);
                }}
                className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Buka Diagnostik Auth
              </button>
              <button
                type="button"
                onClick={() => setShowSetupGuide(false)}
                className="rounded-lg bg-[#0F1E36] px-4 py-2 text-xs font-medium text-white hover:bg-[#162A4A] dark:bg-violet-700 dark:hover:bg-violet-600"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      <AuthDiagnosticModal
        open={showDiagnosticModal}
        fbStatus={fbStatus}
        onClose={() => setShowDiagnosticModal(false)}
      />
      <InstallHigayonModal open={showInstallGuide} onClose={() => setShowInstallGuide(false)} />
    </div>
  );
};
