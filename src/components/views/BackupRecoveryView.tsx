import React, {useCallback, useEffect, useState} from 'react';
import {
  CheckCircle2,
  CloudUpload,
  DatabaseBackup,
  Download,
  FileCheck2,
  HardDriveUpload,
  RotateCcw,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import {useChurch} from '../../contexts/ChurchContext';
import {
  MAX_BACKUP_ARCHIVE_BYTES,
  validateBackupArchiveObject,
  type ChurchBackupArchive,
} from '../../domain/backup';
import {
  createChurchBackupRecord,
  downloadChurchBackupArchive,
  fetchChurchBackups,
  restoreChurchFromBackupArchive,
  type RestoreExecutionResult,
} from '../../services/churchService';
import {
  getDriveBackupConfigStatus,
  uploadArchiveToGoogleDrive,
} from '../../services/driveBackupService';
import type {BackupRecord, BackupRecordSummary} from '../../types/domain';
import {formatDateTimeID} from '../../utils/formatting';
import {extractUserErrorMessage} from '../../utils/firestoreErrors';
import {EmptyStateIllustration, StatusBadge, ToastBanner} from '../common/DesignPrimitives';
import {ReauthModal} from '../common/ReauthModal';

function formatBytesID(bytes?: number): string {
  if (!bytes || bytes <= 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getScopeLabelID(scope: BackupRecord['scope']): string {
  if (scope === 'full') return 'Lengkap';
  if (scope === 'settings_and_rbac') return 'Pengaturan & RBAC';
  return 'Keuangan';
}

function getBackupTypeLabelID(type?: BackupRecord['backupType']): string {
  if (type === 'scheduled') return 'Terjadwal';
  if (type === 'pre_restore') return 'Pra-Pemulihan';
  return 'Manual';
}

export const BackupRecoveryView: React.FC = () => {
  const {activeChurch, activeSettings, activeMembership, reloadActiveChurch} = useChurch();
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [scope, setScope] = useState<BackupRecord['scope']>('full');
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [uploadingDriveId, setUploadingDriveId] = useState<string | null>(null);

  const [reauthMode, setReauthMode] = useState<'backup' | 'restore' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Restore Wizard State (4 steps)
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [rawArchiveText, setRawArchiveText] = useState<string>('');
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [verifiedArchive, setVerifiedArchive] = useState<ChurchBackupArchive | null>(null);
  const [verifiedSummary, setVerifiedSummary] = useState<BackupRecordSummary | null>(null);
  const [ackPreRestoreSafety, setAckPreRestoreSafety] = useState(false);
  const [verifyingArchive, setVerifyingArchive] = useState(false);
  const [restoreResult, setRestoreResult] = useState<RestoreExecutionResult | null>(null);

  const driveStatus = getDriveBackupConfigStatus();

  const loadBackups = useCallback(async () => {
    if (!activeChurch || !activeMembership || activeMembership.role !== 'owner') return;
    setLoading(true);
    setError(null);
    try {
      const items = await fetchChurchBackups(activeChurch.id, activeMembership);
      setBackups(items);
    } catch (err) {
      setError(extractUserErrorMessage(err, 'Gagal memuat riwayat backup.'));
    } finally {
      setLoading(false);
    }
  }, [activeChurch, activeMembership]);

  useEffect(() => {
    void loadBackups();
  }, [loadBackups]);

  if (!activeChurch || !activeMembership || activeMembership.role !== 'owner') {
    return (
      <EmptyStateIllustration
        kind="access-denied"
        title="Akses Backup Dibatasi"
        description="Hanya Church Owner yang berhak membuat arsip backup terverifikasi dan melakukan pemulihan data gereja."
      />
    );
  }

  const triggerJsonDownload = (fileName: string, content: string) => {
    const blob = new Blob([content], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const executeBackup = async () => {
    try {
      const {record, exportPayload, storageUploaded} = await createChurchBackupRecord(
        activeChurch.id,
        activeMembership,
        activeChurch,
        activeSettings,
        scope,
      );

      triggerJsonDownload(`higayon-backup-${activeChurch.id}-${record.id}.json`, exportPayload);

      setNotice(
        `Backup ${record.id} berhasil diverifikasi (SHA-256: ${record.checksum.slice(0, 12)}...)${
          storageUploaded ? ', tersimpan di Cloud Storage privat,' : ''
        } dan diunduh.`,
      );
      await loadBackups();
    } catch (err) {
      setError(extractUserErrorMessage(err, 'Gagal membuat arsip backup.'));
      throw err;
    }
  };

  const handleDownloadExisting = async (record: BackupRecord) => {
    setError(null);
    setNotice(null);
    setDownloadingId(record.id);
    try {
      const payload = await downloadChurchBackupArchive(activeChurch.id, activeMembership, record);
      triggerJsonDownload(`higayon-backup-${activeChurch.id}-${record.id}.json`, payload);
      setNotice(`Arsip ${record.id} lulus verifikasi SHA-256 dan selesai diunduh.`);
    } catch (err) {
      setError(extractUserErrorMessage(err, 'Gagal mengunduh arsip backup.'));
    } finally {
      setDownloadingId(null);
    }
  };

  const handleUploadDrive = async (record: BackupRecord) => {
    setError(null);
    setNotice(null);
    setUploadingDriveId(record.id);
    try {
      const payload = await downloadChurchBackupArchive(activeChurch.id, activeMembership, record);
      const uploaded = await uploadArchiveToGoogleDrive(
        `higayon-backup-${activeChurch.id}-${record.id}.json`,
        payload,
      );
      setNotice(
        `Arsip ${uploaded.name} berhasil dikirim ke Google Drive pribadi Anda (ID File: ${uploaded.fileId}).`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengunggah backup ke Google Drive.');
    } finally {
      setUploadingDriveId(null);
    }
  };

  const openWizard = () => {
    setError(null);
    setNotice(null);
    setWizardStep(1);
    setRawArchiveText('');
    setSelectedFileName('');
    setVerifiedArchive(null);
    setVerifiedSummary(null);
    setAckPreRestoreSafety(false);
    setRestoreResult(null);
    setWizardOpen(true);
  };

  const verifyArchiveAndAdvance = async (
    textPayload: string,
    label: string,
    expectedChecksum?: string,
  ) => {
    setError(null);
    setVerifyingArchive(true);
    try {
      if (new TextEncoder().encode(textPayload).byteLength > MAX_BACKUP_ARCHIVE_BYTES) {
        throw new Error('Ukuran file arsip melebihi batas maksimum 25 MB.');
      }
      const parsed = JSON.parse(textPayload) as unknown;
      const result = await validateBackupArchiveObject(parsed, activeChurch.id, expectedChecksum);
      if (!result.valid || !result.archive || !result.summary) {
        throw new Error(result.error || 'Arsip gagal diverifikasi.');
      }
      setRawArchiveText(textPayload);
      setSelectedFileName(label);
      setVerifiedArchive(result.archive);
      setVerifiedSummary(result.summary);
      setWizardStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'File arsip backup tidak valid.');
    } finally {
      setVerifyingArchive(false);
    }
  };

  const handleWizardFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_BACKUP_ARCHIVE_BYTES) {
      setError('Ukuran file melebihi batas maksimum 25 MB.');
      return;
    }
    const text = await file.text();
    await verifyArchiveAndAdvance(text, file.name);
  };

  const handleWizardLoadHistory = async (record: BackupRecord) => {
    setVerifyingArchive(true);
    setError(null);
    try {
      const payload = await downloadChurchBackupArchive(activeChurch.id, activeMembership, record);
      await verifyArchiveAndAdvance(payload, `${record.id}.json`, record.checksum);
    } catch (err) {
      setError(extractUserErrorMessage(err, 'Gagal mengambil arsip dari Cloud Storage.'));
      setVerifyingArchive(false);
    }
  };

  const executeRestore = async () => {
    if (!rawArchiveText) {
      throw new Error('Tidak ada arsip backup yang siap dipulihkan.');
    }
    try {
      const res = await restoreChurchFromBackupArchive(
        activeChurch.id,
        activeMembership,
        activeChurch,
        activeSettings,
        rawArchiveText,
      );
      setRestoreResult(res);
      setWizardStep(4);
      await Promise.all([loadBackups(), reloadActiveChurch()]);
      setNotice(
        `Pemulihan dari arsip ${res.verifiedBackupId} selesai dengan cadangan pra-pemulihan ${res.preRestoreBackupId}.`,
      );
    } catch (err) {
      setError(extractUserErrorMessage(err, 'Proses pemulihan data gagal.'));
      throw err;
    }
  };

  return (
    <div className="space-y-6">
      {error && <ToastBanner tone="error" message={error} onDismiss={() => setError(null)} />}
      {notice && <ToastBanner tone="success" message={notice} onDismiss={() => setNotice(null)} />}

      {/* Main Manual Backup Card */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#EBF2FC] text-[#0F1E36] dark:bg-violet-950/60 dark:text-violet-300">
              <DatabaseBackup className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                Backup &amp; Pemulihan Gereja
              </h1>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                Setiap arsip backup terisolasi secara ketat hanya untuk ruang kerja{' '}
                <strong className="text-slate-900 dark:text-slate-100">{activeChurch.name}</strong>,
                mencatat checksum SHA-256 ke Firestore, serta menyimpannya ke Cloud Storage privat.
              </p>
            </div>
          </div>

          <StatusBadge
            variant={activeSettings?.automatedBackupEnabled ? 'success' : 'neutral'}
            label={
              activeSettings?.automatedBackupEnabled
                ? 'Jadwal Harian 02:00 WIB Aktif'
                : 'Jadwal Otomatis Nonaktif'
            }
          />
        </div>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-t border-slate-100 pt-5 dark:border-slate-800">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label
                htmlFor="bkp-scope"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Cakupan Arsip Backup
              </label>
              <select
                id="bkp-scope"
                value={scope}
                onChange={(e) => setScope(e.target.value as BackupRecord['scope'])}
                className="mt-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="full">Lengkap (Jemaat, Keuangan, Kebijakan, Audit)</option>
                <option value="settings_and_rbac">Pengaturan &amp; Hak Akses Pengguna</option>
                <option value="finance_only">Khusus Data Keuangan</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => {
                setError(null);
                setNotice(null);
                setReauthMode('backup');
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-[#0F1E36] px-4 py-2 text-xs font-medium text-white hover:bg-[#162A4A] whitespace-nowrap dark:bg-violet-700 dark:hover:bg-violet-600"
            >
              <Download className="h-3.5 w-3.5" />
              Buat &amp; Unduh Backup
            </button>
          </div>

          <button
            type="button"
            onClick={openWizard}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            <RotateCcw className="h-3.5 w-3.5 text-violet-700 dark:text-violet-400" />
            Wizard Pemulihan Data (4 Langkah)
          </button>
        </div>
      </section>

      {/* Google Drive Optional External Copy */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <HardDriveUpload className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Salinan Tambahan ke Google Drive Owner (Opsional)
              </h2>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                {driveStatus.detailMessage}
              </p>
            </div>
          </div>

          <StatusBadge
            variant={driveStatus.configured ? 'success' : 'warning'}
            label={driveStatus.statusLabel}
          />
        </div>

        {!driveStatus.configured && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-[11px] leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
            <strong className="text-slate-800 dark:text-slate-200">Cara mengaktifkan:</strong>{' '}
            Tambahkan variabel{' '}
            <code className="rounded bg-slate-200/70 px-1 py-0.5 font-mono text-[10px] dark:bg-slate-800">
              VITE_GOOGLE_DRIVE_CLIENT_ID
            </code>{' '}
            dari Google Cloud OAuth 2.0 Web Client dengan scope{' '}
            <code className="rounded bg-slate-200/70 px-1 py-0.5 font-mono text-[10px] dark:bg-slate-800">
              https://www.googleapis.com/auth/drive.file
            </code>
            . Tanpa konfigurasi ini, pencadangan primer tetap berjalan aman melalui unduhan arsip
            lokal dan Firebase Storage privat.
          </div>
        )}
      </section>

      {/* Restore Wizard Panel */}
      {wizardOpen && (
        <section
          aria-label="Wizard Pemulihan Arsip Backup"
          className="rounded-xl border border-violet-300 bg-white p-6 shadow-sm dark:border-violet-800 dark:bg-slate-900"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Wizard Pemulihan Data Aman — Langkah {wizardStep} dari 4
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Setiap pemulihan otomatis membuat backup keselamatan <em>pre_restore</em> sebelum
                menulis ulang data aktif.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setWizardOpen(false)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Tutup Wizard
            </button>
          </div>

          {/* Stepper Indicator */}
          <ol className="mt-4 grid gap-2 text-xs sm:grid-cols-4">
            {[
              {step: 1, label: '1. Pilih Sumber Arsip'},
              {step: 2, label: '2. Verifikasi SHA-256'},
              {step: 3, label: '3. Konfirmasi & Safety Backup'},
              {step: 4, label: '4. Ringkasan Pemulihan'},
            ].map((item) => (
              <li
                key={item.step}
                className={`rounded-lg border px-3 py-2 font-medium ${
                  wizardStep === item.step
                    ? 'border-violet-500 bg-violet-50 text-violet-900 dark:border-violet-600 dark:bg-violet-950/50 dark:text-violet-200'
                    : wizardStep > item.step
                      ? 'border-teal-200 bg-teal-50/70 text-teal-800 dark:border-teal-800 dark:bg-teal-950/30 dark:text-teal-300'
                      : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400'
                }`}
              >
                {item.label}
              </li>
            ))}
          </ol>

          {wizardStep === 1 && (
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Opsi A — Unggah File Arsip Lokal (.json)
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Pilih file <span className="font-mono">.json</span> hasil ekspor resmi dari
                  gereja ini. Sistem akan menolak arsip milik gereja lain atau file yang telah
                  dimodifikasi.
                </p>
                <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#0F1E36] px-4 py-2 text-xs font-medium text-white hover:bg-[#162A4A] dark:bg-violet-700 dark:hover:bg-violet-600">
                  <Upload className="h-3.5 w-3.5" />
                  {verifyingArchive ? 'Memverifikasi...' : 'Pilih File JSON Backup'}
                  <input
                    type="file"
                    accept="application/json,.json"
                    onChange={(e) => void handleWizardFileSelect(e)}
                    disabled={verifyingArchive}
                    className="sr-only"
                  />
                </label>
              </div>

              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Opsi B — Pilih Dari Cloud Storage Privat
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Ambil arsip yang tersimpan di bucket aman milik gereja Anda.
                </p>
                <div className="mt-3 max-h-40 space-y-2 overflow-y-auto">
                  {backups.filter((b) => Boolean(b.storagePath)).length === 0 ? (
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      Belum ada arsip tersimpan di Cloud Storage gereja.
                    </p>
                  ) : (
                    backups
                      .filter((b) => Boolean(b.storagePath))
                      .slice(0, 6)
                      .map((b) => (
                        <div
                          key={b.id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-950"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-mono font-medium text-slate-900 dark:text-slate-100">
                              {b.id}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              {formatDateTimeID(b.createdAt, activeChurch.timezone)} ·{' '}
                              {formatBytesID(b.sizeBytes)}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={verifyingArchive}
                            onClick={() => void handleWizardLoadHistory(b)}
                            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                          >
                            Verifikasi
                          </button>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </div>
          )}

          {wizardStep === 2 && verifiedArchive && verifiedSummary && (
            <div className="mt-5 space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-teal-200 bg-teal-50/70 p-4 text-xs text-teal-900 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-200">
                <FileCheck2 className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">
                    Integritas SHA-256 &amp; Isolasi Gereja Terverifikasi
                  </p>
                  <p className="mt-1 font-mono text-[11px]">
                    Sumber: {selectedFileName} · ID: {verifiedArchive.backupId} · Checksum:{' '}
                    {verifiedArchive.checksum.slice(0, 20)}...
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  {label: 'Jemaat', value: verifiedSummary.members},
                  {label: 'Keluarga', value: verifiedSummary.families},
                  {label: 'Akun Kas', value: verifiedSummary.accounts},
                  {label: 'Kategori', value: verifiedSummary.categories},
                  {label: 'Transaksi', value: verifiedSummary.transactions},
                  {label: 'Audit Log', value: verifiedSummary.auditLogs},
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
                  >
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{stat.label}</p>
                    <p className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setWizardStep(1)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Pilih Arsip Lain
                </button>
                <button
                  type="button"
                  onClick={() => setWizardStep(3)}
                  className="rounded-lg bg-[#0F1E36] px-4 py-2 text-xs font-medium text-white hover:bg-[#162A4A] dark:bg-violet-700 dark:hover:bg-violet-600"
                >
                  Lanjut ke Konfirmasi
                </button>
              </div>
            </div>
          )}

          {wizardStep === 3 && verifiedArchive && (
            <div className="mt-5 space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 text-xs leading-relaxed text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                <p className="font-semibold">Kebijakan Perlindungan Pemulihan</p>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  <li>
                    Sebelum pemulihan dijalankan, sistem wajib membuat backup keselamatan{' '}
                    <span className="font-mono">pre_restore</span> secara otomatis.
                  </li>
                  <li>
                    Data jemaat, keluarga, pengaturan gereja, kategori keuangan, dan draf transaksi
                    yang hilang akan dipulihkan.
                  </li>
                  <li>
                    Akun kas yang sudah ada dan transaksi berstatus final (<em>approved / voided</em>
                    ) tetap dipertahankan karena bersifat immutabel di buku besar Firestore.
                  </li>
                </ul>
              </div>

              <label className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={ackPreRestoreSafety}
                  onChange={(e) => setAckPreRestoreSafety(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-violet-700"
                />
                <span>
                  Saya memahami dampak pemulihan dari arsip{' '}
                  <strong className="font-mono">{verifiedArchive.backupId}</strong> dan menyetujui
                  pembuatan backup keselamatan <em>pre_restore</em>.
                </span>
              </label>

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setWizardStep(2)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Kembali
                </button>
                <button
                  type="button"
                  disabled={!ackPreRestoreSafety}
                  onClick={() => setReauthMode('restore')}
                  className="rounded-lg bg-rose-700 px-4 py-2 text-xs font-medium text-white hover:bg-rose-600 disabled:opacity-50"
                >
                  Verifikasi Owner &amp; Mulai Pemulihan
                </button>
              </div>
            </div>
          )}

          {wizardStep === 4 && restoreResult && (
            <div className="mt-5 space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-teal-200 bg-teal-50/70 p-4 text-xs text-teal-900 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-200">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">Pemulihan Selesai &amp; Tercatat di Audit Log</p>
                  <p className="mt-1">
                    Backup keselamatan <span className="font-mono">{restoreResult.preRestoreBackupId}</span>{' '}
                    dibuat sebelum pemulihan dari <span className="font-mono">{restoreResult.verifiedBackupId}</span>.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 text-xs sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <p className="text-slate-500 dark:text-slate-400">Jemaat &amp; Keluarga</p>
                  <p className="mt-1 font-mono font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                    {restoreResult.restoredCounts.congregationMembers} jemaat ·{' '}
                    {restoreResult.restoredCounts.familyGroups} keluarga
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <p className="text-slate-500 dark:text-slate-400">Keuangan Dipulihkan</p>
                  <p className="mt-1 font-mono font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                    {restoreResult.restoredCounts.financeAccounts} akun ·{' '}
                    {restoreResult.restoredCounts.financeCategories} kategori ·{' '}
                    {restoreResult.restoredCounts.financeTransactions} draf
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <p className="text-slate-500 dark:text-slate-400">Dokumen Immutabel Dilewati</p>
                  <p className="mt-1 font-mono font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                    {restoreResult.skippedImmutableCount} dokumen
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Backup History */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            Riwayat Arsip Backup
          </h2>
          <span className="font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
            {backups.length} arsip tercatat
          </span>
        </div>

        {loading ? (
          <div className="mt-4 h-28 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
        ) : backups.length === 0 ? (
          <div className="mt-4">
            <EmptyStateIllustration
              kind="backup-success"
              title="Belum Ada Riwayat Backup"
              description="Buat backup lengkap pertama untuk melindungi seluruh data jemaat, catatan keuangan, dan konfigurasi gereja Anda."
              actionLabel="Buat Backup Pertama"
              onAction={() => setReauthMode('backup')}
            />
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="mt-4 hidden overflow-x-auto md:block">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <tr>
                    <th className="py-2.5 pr-4 font-medium">Waktu</th>
                    <th className="py-2.5 pr-4 font-medium">ID &amp; Tipe</th>
                    <th className="py-2.5 pr-4 font-medium">Cakupan &amp; Ukuran</th>
                    <th className="py-2.5 pr-4 font-medium">Checksum SHA-256</th>
                    <th className="py-2.5 text-right font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {backups.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="whitespace-nowrap py-3 pr-4 font-mono text-[11px] text-slate-600 tabular-nums dark:text-slate-400">
                        {formatDateTimeID(b.createdAt, activeChurch.timezone)}
                      </td>
                      <td className="py-3 pr-4">
                        <p className="font-mono text-[11px] font-medium text-slate-900 dark:text-slate-100">
                          {b.id}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {getBackupTypeLabelID(b.backupType)}
                          {b.recordSummary
                            ? ` · ${b.recordSummary.members} jemaat, ${b.recordSummary.transactions} transaksi`
                            : ''}
                        </p>
                      </td>
                      <td className="py-3 pr-4 text-slate-700 dark:text-slate-300">
                        <span>{getScopeLabelID(b.scope)}</span>
                        <span aria-hidden="true"> · </span>
                        <span className="font-mono text-[11px] tabular-nums">
                          {formatBytesID(b.sizeBytes)}
                        </span>
                      </td>
                      <td className="py-3 pr-4 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <ShieldCheck className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                          {b.checksum.slice(0, 18)}...
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          {b.storagePath && (
                            <button
                              type="button"
                              disabled={downloadingId === b.id}
                              onClick={() => void handleDownloadExisting(b)}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              <Download className="h-3 w-3" />
                              {downloadingId === b.id ? 'Mengunduh...' : 'Unduh'}
                            </button>
                          )}
                          {driveStatus.configured && b.storagePath && (
                            <button
                              type="button"
                              disabled={uploadingDriveId === b.id}
                              onClick={() => void handleUploadDrive(b)}
                              className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-800 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-300"
                            >
                              <CloudUpload className="h-3 w-3" />
                              {uploadingDriveId === b.id ? 'Mengunggah...' : 'Drive'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="mt-4 space-y-3 md:hidden">
              {backups.map((b) => (
                <div
                  key={b.id}
                  className="rounded-lg border border-slate-200 p-4 text-xs dark:border-slate-800"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-mono font-medium text-slate-900 dark:text-slate-100">
                        {b.id}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                        {formatDateTimeID(b.createdAt, activeChurch.timezone)}
                      </p>
                    </div>
                    <StatusBadge variant="info" label={getBackupTypeLabelID(b.backupType)} />
                  </div>
                  <p className="mt-2 text-slate-600 dark:text-slate-300">
                    {getScopeLabelID(b.scope)} · {formatBytesID(b.sizeBytes)}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    SHA-256: {b.checksum.slice(0, 20)}...
                  </p>
                  {b.storagePath && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={downloadingId === b.id}
                        onClick={() => void handleDownloadExisting(b)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Unduh Arsip
                      </button>
                      {driveStatus.configured && (
                        <button
                          type="button"
                          disabled={uploadingDriveId === b.id}
                          onClick={() => void handleUploadDrive(b)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 px-3 py-1.5 text-xs font-medium text-violet-800 dark:border-violet-800 dark:text-violet-300"
                        >
                          <CloudUpload className="h-3.5 w-3.5" />
                          Simpan ke Drive
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <ReauthModal
        open={reauthMode !== null}
        title={
          reauthMode === 'restore'
            ? 'Autentikasi Ulang Pemulihan Data'
            : 'Autentikasi Ulang Ekspor Backup'
        }
        description={
          reauthMode === 'restore'
            ? 'Pemulihan data menimpa state aktif dengan cadangan terpilih dan memerlukan verifikasi identitas Church Owner.'
            : 'Ekspor cadangan data gereja memerlukan verifikasi identitas ulang Church Owner.'
        }
        onConfirm={reauthMode === 'restore' ? executeRestore : executeBackup}
        onClose={() => setReauthMode(null)}
      />
    </div>
  );
};
