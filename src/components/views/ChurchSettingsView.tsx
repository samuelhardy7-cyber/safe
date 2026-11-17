import React, {useCallback, useEffect, useState} from 'react';
import {AlertCircle, Building2, CheckCircle2, Shield, UserCheck, XCircle} from 'lucide-react';
import {useChurch} from '../../contexts/ChurchContext';
import {
  executeOwnershipTransferServer,
  fetchChurchMembers,
  fetchOwnershipTransfers,
  initiateOwnershipTransfer,
  respondToOwnershipTransfer,
  updateChurchConfiguration,
} from '../../services/churchService';
import type {
  ChurchMembership,
  CurrencyCode,
  LanguageCode,
  OwnershipTransferRequest,
} from '../../types/domain';
import {extractUserErrorMessage} from '../../utils/firestoreErrors';
import {formatDateTimeID, getRoleLabelID} from '../../utils/formatting';
import {StatusBadge} from '../common/DesignPrimitives';
import {ReauthModal} from '../common/ReauthModal';

export const ChurchSettingsView: React.FC = () => {
  const {activeChurch, activeSettings, activeMembership, reloadActiveChurch} = useChurch();

  const [name, setName] = useState('');
  const [denomination, setDenomination] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [timezone, setTimezone] = useState('Asia/Jakarta');
  const [currency, setCurrency] = useState<CurrencyCode>('IDR');
  const [language, setLanguage] = useState<LanguageCode>('id');

  const [address, setAddress] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [fiscalYearStartMonth, setFiscalYearStartMonth] = useState(1);
  const [requireMfaForFinanceApproval, setRequireMfaForFinanceApproval] = useState(true);
  const [requirePinForSensitiveActions, setRequirePinForSensitiveActions] = useState(false);
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(30);
  const [automatedBackupEnabled, setAutomatedBackupEnabled] = useState(false);

  // Ownership transfer state
  const [members, setMembers] = useState<ChurchMembership[]>([]);
  const [transfers, setTransfers] = useState<OwnershipTransferRequest[]>([]);
  const [selectedCandidateUid, setSelectedCandidateUid] = useState('');
  const [pendingFinalTransfer, setPendingFinalTransfer] =
    useState<OwnershipTransferRequest | null>(null);

  const [reauthMode, setReauthMode] = useState<'settings' | 'transfer_init' | 'transfer_exec' | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!activeChurch) return;
    setName(activeChurch.name);
    setDenomination(activeChurch.denomination || '');
    setCity(activeChurch.city);
    setCountry(activeChurch.country);
    setTimezone(activeChurch.timezone);
    setCurrency(activeChurch.currency);
    setLanguage(activeChurch.language);
  }, [activeChurch]);

  useEffect(() => {
    if (!activeSettings) return;
    setAddress(activeSettings.address || '');
    setContactEmail(activeSettings.contactEmail || '');
    setContactPhone(activeSettings.contactPhone || '');
    setFiscalYearStartMonth(activeSettings.fiscalYearStartMonth || 1);
    setRequireMfaForFinanceApproval(Boolean(activeSettings.requireMfaForFinanceApproval));
    setRequirePinForSensitiveActions(Boolean(activeSettings.requirePinForSensitiveActions));
    setSessionTimeoutMinutes(activeSettings.sessionTimeoutMinutes || 30);
    setAutomatedBackupEnabled(Boolean(activeSettings.automatedBackupEnabled));
  }, [activeSettings]);

  const loadGovernance = useCallback(async () => {
    if (!activeChurch || !activeMembership || activeMembership.role !== 'owner') return;
    try {
      const [mList, tList] = await Promise.all([
        fetchChurchMembers(activeChurch.id, activeMembership),
        fetchOwnershipTransfers(activeChurch.id, activeMembership),
      ]);
      setMembers(
        mList.filter((m) => m.status === 'active' && m.uid !== activeMembership.uid),
      );
      setTransfers(tList);
    } catch {
      // Non-blocking governance fetch
    }
  }, [activeChurch, activeMembership]);

  useEffect(() => {
    void loadGovernance();
  }, [loadGovernance]);

  if (!activeChurch || !activeMembership || activeMembership.role !== 'owner') {
    return (
      <div className="rounded-xl border border-rose-200 bg-white p-6 text-sm text-rose-700 dark:border-rose-900/70 dark:bg-slate-900 dark:text-rose-300">
        Hanya Church Owner yang berhak mengubah profil dan kebijakan keamanan gereja.
      </div>
    );
  }

  const handleRequestSave = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setReauthMode('settings');
  };

  const executeSave = async () => {
    try {
      await updateChurchConfiguration(
        activeChurch.id,
        activeMembership,
        {
          name,
          denomination,
          city,
          country,
          timezone,
          currency,
          language,
        },
        {
          address,
          contactEmail,
          contactPhone,
          fiscalYearStartMonth,
          requireMfaForFinanceApproval,
          requirePinForSensitiveActions,
          sessionTimeoutMinutes,
          automatedBackupEnabled,
        },
      );
      await reloadActiveChurch();
      setNotice('Pengaturan gereja dan kebijakan keamanan berhasil diperbarui.');
    } catch (err) {
      setError(extractUserErrorMessage(err, 'Gagal menyimpan pengaturan gereja.'));
      throw err;
    }
  };

  const executeInitiateTransfer = async () => {
    const candidate = members.find((m) => m.uid === selectedCandidateUid);
    if (!candidate) throw new Error('Pilih akun anggota aktif sebagai kandidat Owner baru.');
    try {
      await initiateOwnershipTransfer(activeChurch.id, activeMembership, candidate);
      setSelectedCandidateUid('');
      await loadGovernance();
      setNotice(
        `Permintaan pemindahan kepemilikan dikirim ke ${candidate.email}. Penerima harus menyetujui dari menu Pengaturan Akun mereka.`,
      );
    } catch (err) {
      setError(extractUserErrorMessage(err, 'Gagal memulai pemindahan kepemilikan.'));
      throw err;
    }
  };

  const executeCompleteTransfer = async () => {
    if (!pendingFinalTransfer) throw new Error('Permintaan transfer tidak ditemukan.');
    try {
      await executeOwnershipTransferServer(activeChurch.id, pendingFinalTransfer.id);
      setPendingFinalTransfer(null);
      await Promise.all([loadGovernance(), reloadActiveChurch()]);
      setNotice(
        'Kepemilikan gereja berhasil dipindahkan melalui Cloud Function terverifikasi.',
      );
    } catch (err) {
      setError(extractUserErrorMessage(err, 'Gagal mengeksekusi pemindahan kepemilikan.'));
      throw err;
    }
  };

  const handleCancelTransfer = async (transfer: OwnershipTransferRequest) => {
    setError(null);
    setNotice(null);
    try {
      await respondToOwnershipTransfer(activeChurch.id, activeMembership, transfer, false);
      await loadGovernance();
      setNotice(`Permintaan pemindahan kepemilikan ke ${transfer.toEmail} telah dibatalkan.`);
    } catch (err) {
      setError(extractUserErrorMessage(err, 'Gagal membatalkan transfer kepemilikan.'));
    }
  };

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

      <form onSubmit={handleRequestSave} className="space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <Building2 className="h-5 w-5 text-[#0F1E36] dark:text-violet-400" />
            <div>
              <h1 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                Profil &amp; Lokalisasi Gereja
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Church ID:{' '}
                <span className="font-mono text-slate-700 dark:text-slate-300">
                  {activeChurch.id}
                </span>
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label
                htmlFor="cs-name"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Nama Gereja *
              </label>
              <input
                id="cs-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label
                htmlFor="cs-denom"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Sinode / Denominasi
              </label>
              <input
                id="cs-denom"
                type="text"
                value={denomination}
                onChange={(e) => setDenomination(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label
                htmlFor="cs-city"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Kota *
              </label>
              <input
                id="cs-city"
                type="text"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label
                htmlFor="cs-country"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Negara *
              </label>
              <input
                id="cs-country"
                type="text"
                required
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label
                htmlFor="cs-timezone"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Zona Waktu
              </label>
              <select
                id="cs-timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="Asia/Jakarta">Asia/Jakarta (WIB)</option>
                <option value="Asia/Makassar">Asia/Makassar (WITA)</option>
                <option value="Asia/Jayapura">Asia/Jayapura (WIT)</option>
                <option value="Asia/Singapore">Asia/Singapore</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="cs-currency"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Mata Uang
              </label>
              <select
                id="cs-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="IDR">Rupiah (IDR)</option>
                <option value="USD">US Dollar (USD)</option>
                <option value="SGD">Singapore Dollar (SGD)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="cs-lang"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Bahasa Aplikasi
              </label>
              <select
                id="cs-lang"
                value={language}
                onChange={(e) => setLanguage(e.target.value as LanguageCode)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="id">Bahasa Indonesia</option>
                <option value="en">English</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="cs-address"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Alamat Sekretariat Gereja
              </label>
              <input
                id="cs-address"
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label
                htmlFor="cs-email"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Email Resmi Sekretariat
              </label>
              <input
                id="cs-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label
                htmlFor="cs-phone"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Telepon Sekretariat
              </label>
              <input
                id="cs-phone"
                type="text"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <Shield className="h-5 w-5 text-violet-700 dark:text-violet-400" />
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Kebijakan Fiskal, Sesi &amp; Backup Otomatis
            </h2>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="cs-fiscal"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Bulan Awal Tahun Fiskal (1–12)
              </label>
              <input
                id="cs-fiscal"
                type="number"
                min={1}
                max={12}
                value={fiscalYearStartMonth}
                onChange={(e) => setFiscalYearStartMonth(Number(e.target.value))}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label
                htmlFor="cs-timeout"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Batas Waktu Sesi Tidak Aktif (Menit)
              </label>
              <input
                id="cs-timeout"
                type="number"
                min={5}
                max={120}
                value={sessionTimeoutMinutes}
                onChange={(e) => setSessionTimeoutMinutes(Number(e.target.value))}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="mt-5 space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
            <label className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={requireMfaForFinanceApproval}
                onChange={(e) => setRequireMfaForFinanceApproval(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-violet-700"
              />
              <span>
                Wajibkan perlindungan akun kuat (MFA) bagi pengguna yang memiliki hak persetujuan
                keuangan.
              </span>
            </label>

            <label className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={requirePinForSensitiveActions}
                onChange={(e) => setRequirePinForSensitiveActions(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-violet-700"
              />
              <span>
                Anjurkan kunci sesi PIN lokal sebagai lapisan tambahan sebelum membuka ulang sesi di
                perangkat bersama.
              </span>
            </label>

            <label className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={automatedBackupEnabled}
                onChange={(e) => setAutomatedBackupEnabled(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-violet-700"
              />
              <span>
                Aktifkan backup otomatis harian (pukul 02:00 WIB) ke Firebase Cloud Storage privat
                (memerlukan Cloud Functions terjadwal aktif pada paket Firebase Blaze).
              </span>
            </label>
          </div>

          <div className="mt-6 flex justify-end border-t border-slate-100 pt-4 dark:border-slate-800">
            <button
              type="submit"
              className="rounded-lg bg-[#0F1E36] px-5 py-2.5 text-xs font-medium text-white hover:bg-[#162A4A] dark:bg-violet-700 dark:hover:bg-violet-600"
            >
              Simpan Pengaturan Gereja
            </button>
          </div>
        </section>
      </form>

      {/* Multi-step Ownership Transfer */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-2.5">
          <UserCheck className="mt-0.5 h-5 w-5 text-amber-600 dark:text-amber-400" />
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Pemindahan Kepemilikan Gereja (Ownership Transfer)
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Pemindahan kepemilikan bersifat multi-langkah: Owner menunjuk anggota aktif → Penerima
              menyetujui melalui Pengaturan Akun → Finalisasi server melalui Cloud Function{' '}
              <span className="font-mono">completeChurchOwnershipTransfer</span> (mengubah seluruh
              dokumen <span className="font-mono">ownerUid</span> gereja secara atomik).
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
          <div className="min-w-[240px] flex-1">
            <label
              htmlFor="cs-transfer-target"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Pilih Anggota Aktif Penerima Owner
            </label>
            <select
              id="cs-transfer-target"
              value={selectedCandidateUid}
              onChange={(e) => setSelectedCandidateUid(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="">-- Pilih Anggota Aktif --</option>
              {members.map((m) => (
                <option key={m.uid} value={m.uid}>
                  {m.displayName} ({m.email}) — {getRoleLabelID(m.role)}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            disabled={!selectedCandidateUid}
            onClick={() => {
              setError(null);
              setNotice(null);
              setReauthMode('transfer_init');
            }}
            className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
          >
            Kirim Permintaan Transfer
          </button>
        </div>

        {transfers.length > 0 && (
          <div className="mt-5 space-y-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Status Permintaan Pemindahan Kepemilikan
            </p>
            {transfers.map((tr) => (
              <div
                key={tr.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800"
              >
                <div>
                  <p className="font-medium text-slate-900 dark:text-slate-100">
                    {tr.fromEmail} → {tr.toEmail}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                    ID: <span className="font-mono">{tr.id}</span> ·{' '}
                    {formatDateTimeID(tr.createdAt, activeChurch.timezone)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge
                    variant={
                      tr.status === 'completed'
                        ? 'success'
                        : tr.status === 'accepted'
                          ? 'info'
                          : tr.status === 'pending'
                            ? 'warning'
                            : 'danger'
                    }
                    label={
                      tr.status === 'pending'
                        ? 'Menunggu Persetujuan Penerima'
                        : tr.status === 'accepted'
                          ? 'Disetujui — Siap Finalisasi'
                          : tr.status === 'completed'
                            ? 'Selesai Dipindahkan'
                            : 'Dibatalkan'
                    }
                  />

                  {tr.status === 'accepted' && (
                    <button
                      type="button"
                      onClick={() => {
                        setPendingFinalTransfer(tr);
                        setReauthMode('transfer_exec');
                      }}
                      className="rounded-lg bg-[#0F1E36] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[#162A4A] dark:bg-violet-700 dark:hover:bg-violet-600"
                    >
                      Finalisasi Server
                    </button>
                  )}

                  {(tr.status === 'pending' || tr.status === 'accepted') && (
                    <button
                      type="button"
                      onClick={() => void handleCancelTransfer(tr)}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-[11px] font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Batalkan
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <ReauthModal
        open={reauthMode !== null}
        title={
          reauthMode === 'transfer_exec'
            ? 'Finalisasi Pemindahan Kepemilikan Gereja'
            : reauthMode === 'transfer_init'
              ? 'Konfirmasi Inisiasi Transfer Owner'
              : 'Konfirmasi Perubahan Pengaturan Gereja'
        }
        description={
          reauthMode === 'transfer_exec'
            ? 'Tindakan ini akan memindahkan peran Church Owner penuh ke penerima melalui Cloud Function dan menurunkan peran Anda menjadi Church Staff.'
            : reauthMode === 'transfer_init'
              ? 'Inisiasi pemindahan kepemilikan gereja dicatat permanen dalam Audit Log.'
              : 'Perubahan profil dan kebijakan keamanan gereja dicatat ke Audit Log permanen.'
        }
        onConfirm={
          reauthMode === 'transfer_exec'
            ? executeCompleteTransfer
            : reauthMode === 'transfer_init'
              ? executeInitiateTransfer
              : executeSave
        }
        onClose={() => setReauthMode(null)}
      />
    </div>
  );
};
