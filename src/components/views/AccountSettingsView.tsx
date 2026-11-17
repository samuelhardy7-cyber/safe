import React, {useCallback, useEffect, useState} from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  KeyRound,
  Laptop,
  LockKeyhole,
  LogOut,
  MailCheck,
  ShieldCheck,
  Smartphone,
  User as UserIcon,
  UserCheck,
} from 'lucide-react';
import {useAuth} from '../../contexts/AuthContext';
import {useChurch} from '../../contexts/ChurchContext';
import {useOnlineStatus} from '../../hooks/useOnlineStatus';
import {usePWAInstall} from '../../hooks/usePWAInstall';
import {requiresStrongAccountProtection} from '../../domain/rbac';
import {hashAppPin, validatePinCode} from '../../domain/validation';
import {
  fetchOwnershipTransfers,
  respondToOwnershipTransfer,
  updateUserMfaAcknowledgement,
  updateUserPinSecurity,
  updateUserProfile,
} from '../../services/churchService';
import type {LocaleCode, OwnershipTransferRequest} from '../../types/domain';
import {extractUserErrorMessage} from '../../utils/firestoreErrors';
import {StatusBadge} from '../common/DesignPrimitives';
import {ReauthModal} from '../common/ReauthModal';
import {InstallHigayonModal} from '../pwa/PWAControls';

export const AccountSettingsView: React.FC = () => {
  const {
    user,
    account,
    refreshAccount,
    updateAuthDisplayName,
    changeUserPassword,
    requestPasswordReset,
    lockSessionWithPin,
    logout,
  } = useAuth();
  const {churchRefs, activeChurch, activeSettings, activeMembership} = useChurch();
  const isOnline = useOnlineStatus();
  const {isInstalled, isInstallable, platform, install} = usePWAInstall();

  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [locale, setLocale] = useState<LocaleCode>('id-ID');
  const [defaultChurchId, setDefaultChurchId] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [newPin, setNewPin] = useState('');
  const [pinAction, setPinAction] = useState<'enable' | 'disable' | null>(null);

  const [pendingOwnershipTransfers, setPendingOwnershipTransfers] = useState<
    OwnershipTransferRequest[]
  >([]);
  const [processingTransferId, setProcessingTransferId] = useState<string | null>(null);
  const [sendingResetEmail, setSendingResetEmail] = useState(false);

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!account) return;
    setDisplayName(account.displayName || '');
    setPhone(account.phone || '');
    setLocale(account.locale || 'id-ID');
    setDefaultChurchId(account.defaultChurchId || '');
  }, [account]);

  const loadIncomingTransfers = useCallback(async () => {
    if (!activeChurch || !activeMembership || !user) {
      setPendingOwnershipTransfers([]);
      return;
    }
    try {
      const list = await fetchOwnershipTransfers(activeChurch.id, activeMembership);
      setPendingOwnershipTransfers(
        list.filter((t) => t.toUid === user.uid && t.status === 'pending'),
      );
    } catch {
      setPendingOwnershipTransfers([]);
    }
  }, [activeChurch, activeMembership, user]);

  useEffect(() => {
    void loadIncomingTransfers();
  }, [loadIncomingTransfers]);

  if (!user || !account) return null;

  const hasPasswordProvider = user.providerData.some((p) => p.providerId === 'password');
  const needsStrongProtection = requiresStrongAccountProtection(activeMembership);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSavingProfile(true);
    try {
      await updateUserProfile(user.uid, {
        displayName,
        phone,
        locale,
        defaultChurchId,
      });
      await updateAuthDisplayName(displayName);
      await refreshAccount();
      setNotice('Profil akun pribadi berhasil diperbarui.');
    } catch (err) {
      setError(extractUserErrorMessage(err, 'Gagal memperbarui profil akun.'));
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (newPassword !== confirmPassword) {
      setError('Konfirmasi kata sandi baru tidak cocok.');
      return;
    }
    setSavingPassword(true);
    try {
      await changeUserPassword(hasPasswordProvider ? currentPassword : undefined, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setNotice('Kata sandi akun berhasil diperbarui.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengubah kata sandi.');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleRequestPinChange = (action: 'enable' | 'disable') => {
    setError(null);
    setNotice(null);
    if (action === 'enable') {
      const check = validatePinCode(newPin);
      if (!check.valid) {
        setError(check.error || 'PIN tidak valid.');
        return;
      }
    }
    setPinAction(action);
  };

  const executePinUpdate = async () => {
    if (!pinAction) return;
    if (pinAction === 'enable') {
      const hashed = await hashAppPin(newPin, user.uid);
      await updateUserPinSecurity(user.uid, true, hashed);
      sessionStorage.setItem(`higayon_pin_unlocked_${user.uid}`, '1');
      setNewPin('');
      setNotice('PIN aplikasi 6 digit diaktifkan sebagai lapisan pengaman sesi lokal.');
    } else {
      await updateUserPinSecurity(user.uid, false, '');
      sessionStorage.removeItem(`higayon_pin_unlocked_${user.uid}`);
      setNotice('PIN aplikasi lokal telah dinonaktifkan.');
    }
    await refreshAccount();
  };

  const handleToggleMfaAck = async () => {
    setError(null);
    setNotice(null);
    try {
      await updateUserMfaAcknowledgement(user.uid, !account.mfaAcknowledged);
      await refreshAccount();
      setNotice('Status kesiapan MFA akun diperbarui.');
    } catch (err) {
      setError(extractUserErrorMessage(err, 'Gagal memperbarui status MFA.'));
    }
  };

  const handleSendPasswordReset = async () => {
    if (!user.email) return;
    setError(null);
    setNotice(null);
    setSendingResetEmail(true);
    try {
      await requestPasswordReset(user.email);
      setNotice(`Tautan pemulihan kata sandi telah dikirim ke ${user.email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengirim email reset kata sandi.');
    } finally {
      setSendingResetEmail(false);
    }
  };

  const handleAcceptOwnership = async (transfer: OwnershipTransferRequest) => {
    if (!activeChurch || !activeMembership) return;
    setError(null);
    setNotice(null);
    setProcessingTransferId(transfer.id);
    try {
      await respondToOwnershipTransfer(activeChurch.id, activeMembership, transfer, true);
      setNotice(
        `Persetujuan diterima. Pemindahan kepemilikan ${activeChurch.name} kini siap difinalisasi oleh Owner saat ini melalui Pengaturan Gereja.`,
      );
      await loadIncomingTransfers();
    } catch (err) {
      setError(extractUserErrorMessage(err, 'Gagal menyetujui penerimaan kepemilikan.'));
    } finally {
      setProcessingTransferId(null);
    }
  };

  const userAgentSummary =
    typeof navigator !== 'undefined'
      ? navigator.userAgent.replace(/\s+/g, ' ').slice(0, 72)
      : 'Perangkat Browser';

  return (
    <div className="space-y-6">
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 dark:border-rose-900/70 dark:bg-rose-950/50 dark:text-rose-200"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/50 dark:text-emerald-200"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Pending Ownership Transfer Offer */}
      {pendingOwnershipTransfers.map((tr) => (
        <section
          key={tr.id}
          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-800/70 dark:bg-amber-950/30"
        >
          <div className="flex items-start gap-3">
            <UserCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
            <div>
              <h2 className="text-sm font-semibold text-amber-950 dark:text-amber-200">
                Permintaan Penyerahan Kepemilikan Gereja
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-amber-900 dark:text-amber-300">
                <strong>{tr.fromEmail}</strong> menunjuk Anda sebagai penerima tanggung jawab{' '}
                <strong>Church Owner</strong> untuk <strong>{activeChurch?.name}</strong>. Setelah
                disetujui, Owner saat ini dapat menyelesaikan transfer melalui server.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={processingTransferId === tr.id}
            onClick={() => void handleAcceptOwnership(tr)}
            className="rounded-lg bg-[#0F1E36] px-4 py-2 text-xs font-medium text-white hover:bg-[#162A4A] disabled:opacity-60 whitespace-nowrap dark:bg-violet-700 dark:hover:bg-violet-600"
          >
            {processingTransferId === tr.id
              ? 'Memproses...'
              : 'Setujui Sebagai Penerima Owner'}
          </button>
        </section>
      ))}

      {/* Personal Profile */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2.5">
          <UserIcon className="h-5 w-5 text-[#0F1E36] dark:text-violet-400" />
          <div>
            <h1 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              Profil Pengguna
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {user.email}
              <span aria-hidden="true"> · </span>
              Email {user.emailVerified ? 'Terverifikasi' : 'Belum Terverifikasi'}
              <span aria-hidden="true"> · </span>
              UID: <span className="font-mono">{user.uid}</span>
            </p>
          </div>
        </div>

        <form onSubmit={(e) => void handleSaveProfile(e)} className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="acc-name"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Nama Lengkap *
            </label>
            <input
              id="acc-name"
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div>
            <label
              htmlFor="acc-phone"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Nomor Telepon
            </label>
            <input
              id="acc-phone"
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+62..."
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div>
            <label
              htmlFor="acc-locale"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Format Bahasa &amp; Regional
            </label>
            <select
              id="acc-locale"
              value={locale}
              onChange={(e) => setLocale(e.target.value as LocaleCode)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="id-ID">Indonesia (id-ID · IDR · WIB)</option>
              <option value="en-US">English (en-US)</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="acc-default-church"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Gereja Bawaan Saat Login
            </label>
            <select
              id="acc-default-church"
              value={defaultChurchId}
              onChange={(e) => setDefaultChurchId(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="">Otomatis (Gereja Pertama)</option>
              {churchRefs.map((ref) => (
                <option key={ref.churchId} value={ref.churchId}>
                  {ref.churchName}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end sm:col-span-2">
            <button
              type="submit"
              disabled={savingProfile}
              className="rounded-lg bg-[#0F1E36] px-4 py-2 text-xs font-medium text-white hover:bg-[#162A4A] disabled:opacity-60 dark:bg-violet-700 dark:hover:bg-violet-600"
            >
              {savingProfile ? 'Menyimpan...' : 'Simpan Profil'}
            </button>
          </div>
        </form>
      </section>

      {/* Active Session & Recovery Control */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-2.5">
            <Laptop className="mt-0.5 h-5 w-5 text-[#0F1E36] dark:text-violet-400" />
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Kontrol Sesi Perangkat &amp; Pemulihan Akun
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Mode: {isInstalled ? 'Aplikasi Terpasang (PWA/Native)' : 'Browser Web'} · Batas
                diam otomatis:{' '}
                <span className="font-mono">{activeSettings?.sessionTimeoutMinutes || 30}</span>{' '}
                menit
              </p>
              <p className="mt-1 font-mono text-[11px] text-slate-400 dark:text-slate-500">
                {userAgentSummary}
              </p>
            </div>
          </div>

          <StatusBadge
            variant={isOnline ? 'success' : 'warning'}
            label={isOnline ? 'Sesi Cloud Aktif' : 'Offline — Data Tidak Dicache'}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Butuh tautan pemulihan kata sandi ke email terdaftar ({user.email})?
          </p>
          <button
            type="button"
            disabled={sendingResetEmail || !hasPasswordProvider}
            onClick={() => void handleSendPasswordReset()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <MailCheck className="h-3.5 w-3.5" />
            {sendingResetEmail
              ? 'Mengirim...'
              : hasPasswordProvider
                ? 'Kirim Email Reset Kata Sandi'
                : 'Login Via Google (Dikelola Google)'}
          </button>
        </div>
      </section>

      {/* Universal Device Installation (PWA) */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-2.5">
            <Smartphone className="mt-0.5 h-5 w-5 text-violet-700 dark:text-violet-400" />
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Instalasi Aplikasi di Perangkat (Install Higayon)
              </h2>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                Pasang Higayon sebagai aplikasi mandiri (PWA) di Android, iPhone/iPad, Windows,
                macOS, atau Linux. Seluruh perangkat terhubung langsung ke backend Cloud Firestore
                yang sama.
              </p>
              <p className="mt-1.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                Platform terdeteksi: <span className="uppercase">{platform}</span> · Status:{' '}
                {isInstalled ? 'Terpasang (Standalone)' : 'Berjalan di Browser'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isInstallable && !isInstalled && (
              <button
                type="button"
                onClick={() => void install()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F1E36] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#162A4A] dark:bg-violet-700 dark:hover:bg-violet-600"
              >
                <Download className="h-3.5 w-3.5" />
                Pasang Langsung
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowInstallGuide(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Download className="h-3.5 w-3.5 text-violet-700 dark:text-violet-400" />
              Panduan Install Higayon
            </button>
          </div>
        </div>
      </section>

      {/* MFA & Strong Account Protection */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-violet-700 dark:text-violet-400" />
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Perlindungan Akun Kuat &amp; Multi-Factor Authentication (MFA)
              </h2>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                {needsStrongProtection
                  ? 'Peran Anda (Church Owner atau Finance Approver) diwajibkan menggunakan autentikasi berlapis (Google 2-Step Verification atau Firebase Auth MFA TOTP/SMS).'
                  : 'Aktifkan verifikasi dua langkah pada penyedia identitas Anda untuk keamanan maksimal.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleToggleMfaAck()}
            className={`rounded-lg border px-3.5 py-2 text-xs font-medium ${
              account.mfaAcknowledged
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            {account.mfaAcknowledged ? 'MFA Terkonfirmasi Aktif' : 'Tandai MFA Sudah Aktif'}
          </button>
        </div>
      </section>

      {/* Change Password */}
      {hasPasswordProvider && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <KeyRound className="h-5 w-5 text-[#0F1E36] dark:text-violet-400" />
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Ubah Kata Sandi
            </h2>
          </div>

          <form
            onSubmit={(e) => void handlePasswordChange(e)}
            className="mt-4 grid gap-4 sm:grid-cols-3"
          >
            <div>
              <label
                htmlFor="acc-curr-pass"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Kata Sandi Saat Ini
              </label>
              <input
                id="acc-curr-pass"
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label
                htmlFor="acc-new-pass"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Kata Sandi Baru
              </label>
              <input
                id="acc-new-pass"
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label
                htmlFor="acc-conf-pass"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Konfirmasi Kata Sandi Baru
              </label>
              <input
                id="acc-conf-pass"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div className="flex justify-end sm:col-span-3">
              <button
                type="submit"
                disabled={savingPassword}
                className="rounded-lg bg-[#0F1E36] px-4 py-2 text-xs font-medium text-white hover:bg-[#162A4A] disabled:opacity-60 dark:bg-violet-700 dark:hover:bg-violet-600"
              >
                {savingPassword ? 'Memperbarui...' : 'Perbarui Kata Sandi'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Secondary App PIN & Session Control */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-2.5">
            <LockKeyhole className="mt-0.5 h-5 w-5 text-[#0F1E36] dark:text-violet-400" />
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                PIN Kunci Sesi Aplikasi (Lapisan Tambahan)
              </h2>
              <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                PIN 6 digit hanya berfungsi sebagai kunci sesi cepat di browser/perangkat ini dan{' '}
                <strong>bukan</strong> pengganti autentikasi Firebase maupun aturan keamanan
                database.
              </p>
            </div>
          </div>

          {account.pinEnabled && (
            <button
              type="button"
              onClick={lockSessionWithPin}
              className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Kunci Sesi Sekarang
            </button>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
          <div>
            <label
              htmlFor="acc-pin-input"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              {account.pinEnabled ? 'Ganti PIN Baru (6 Digit)' : 'Buat PIN Aplikasi (6 Digit)'}
            </label>
            <input
              id="acc-pin-input"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
              className="mt-1.5 w-44 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm tracking-[0.3em] text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <button
            type="button"
            onClick={() => handleRequestPinChange('enable')}
            className="rounded-lg bg-[#0F1E36] px-4 py-2 text-xs font-medium text-white hover:bg-[#162A4A] dark:bg-violet-700 dark:hover:bg-violet-600"
          >
            {account.pinEnabled ? 'Perbarui PIN' : 'Aktifkan PIN'}
          </button>

          {account.pinEnabled && (
            <button
              type="button"
              onClick={() => handleRequestPinChange('disable')}
              className="rounded-lg border border-rose-200 px-4 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40"
            >
              Nonaktifkan PIN
            </button>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Akhiri sesi aktif di perangkat ini
          </span>
          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-4 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40"
          >
            <LogOut className="h-3.5 w-3.5" />
            Keluar dari Akun
          </button>
        </div>
      </section>

      <ReauthModal
        open={pinAction !== null}
        title="Autentikasi Ulang Pengaturan PIN"
        description="Konfirmasi identitas akun Firebase Anda sebelum mengaktifkan, mengubah, atau menonaktifkan PIN aplikasi."
        onConfirm={executePinUpdate}
        onClose={() => setPinAction(null)}
      />

      <InstallHigayonModal open={showInstallGuide} onClose={() => setShowInstallGuide(false)} />
    </div>
  );
};
