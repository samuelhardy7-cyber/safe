import React, {useState} from 'react';
import {readSheet} from 'read-excel-file/browser';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
} from 'lucide-react';
import {
  ALLOWED_MEMBER_STATUSES,
  mapMatrixToImportRows,
  type ParsedImportRow,
  parseCsvText,
  revalidateImportRows,
} from '../../domain/congregation';
import {batchImportCongregationMembers} from '../../services/congregationService';
import type {
  ChurchMembership,
  CongregationMember,
  CongregationMemberStatus,
  CongregationRequiredField,
} from '../../types/domain';
import {
  downloadImportTemplateXlsx,
  exportMembersAsCsv,
  exportMembersAsXlsx,
} from '../../utils/congregationExport';
import {extractUserErrorMessage} from '../../utils/firestoreErrors';
import {getMemberStatusLabelID} from '../../utils/formatting';

interface ImportExportTabProps {
  churchId: string;
  membership: ChurchMembership;
  members: readonly CongregationMember[];
  requiredFields: readonly CongregationRequiredField[];
  onRefresh: () => Promise<void>;
}

export const ImportExportTab: React.FC<ImportExportTabProps> = ({
  churchId,
  membership,
  members,
  requiredFields,
  onRefresh,
}) => {
  const [rows, setRows] = useState<ParsedImportRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [stepMessage, setStepMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmImport, setConfirmImport] = useState(false);
  const [busy, setBusy] = useState(false);

  const activeMembers = members.filter((m) => !m.archived);

  // Steps 1-5: File upload -> Format check -> Parse -> Validate required fields -> Detect duplicates
  const handleFileUpload = async (file: File | null) => {
    if (!file) return;
    setErrorMsg(null);
    setStepMessage(null);
    setConfirmImport(false);

    const ext = file.name.toLowerCase().split('.').pop();
    if (ext !== 'csv' && ext !== 'xlsx') {
      setErrorMsg('Format file tidak didukung. Gunakan file .csv atau .xlsx.');
      return;
    }

    try {
      let matrix: string[][] = [];
      if (ext === 'csv') {
        const text = await file.text();
        matrix = parseCsvText(text);
      } else {
        const sheetData = await readSheet(file);
        matrix = sheetData.map((r) =>
          r.map((cell) => {
            if (cell instanceof Date) {
              return cell.toISOString().slice(0, 10);
            }
            return cell === null || cell === undefined ? '' : String(cell).trim();
          }),
        );
      }

      if (matrix.length < 2) {
        setErrorMsg('File kosong atau hanya berisi header tanpa baris data.');
        return;
      }

      const mapped = mapMatrixToImportRows(matrix, members, requiredFields);
      if (mapped.length === 0) {
        setErrorMsg('Tidak ditemukan baris data jemaat yang dapat dibaca.');
        return;
      }

      setRows(mapped);
      setFileName(file.name);
      setStepMessage(
        `Langkah 1–5 selesai: ${mapped.length} baris dibaca dari "${file.name}". Periksa error atau duplikat sebelum menyimpan.`,
      );
    } catch (err) {
      setErrorMsg(
        extractUserErrorMessage(err, `Gagal membaca file ${ext.toUpperCase()}.`),
      );
    }
  };

  // Step 6: Owner edits/fixes invalid or duplicate rows inline
  const updateRowField = (
    idx: number,
    patch: Partial<Pick<ParsedImportRow, 'fullName' | 'phone' | 'email' | 'status' | 'skip'>>,
  ) => {
    setRows((prev) => {
      const next = prev.map((r, i) => (i === idx ? {...r, ...patch} : r));
      return revalidateImportRows(next, members, requiredFields);
    });
  };

  const validToImport = rows.filter((r) => !r.skip && r.errors.length === 0);
  const errorRowsCount = rows.filter((r) => !r.skip && r.errors.length > 0).length;
  const duplicateRowsCount = rows.filter((r) => !r.skip && Boolean(r.duplicateReason)).length;

  // Steps 7-9: Owner confirms -> Batch import -> Audit log & refresh
  const handleExecuteImport = async () => {
    if (busy || validToImport.length === 0 || errorRowsCount > 0) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await batchImportCongregationMembers(churchId, membership, rows, members);
      setRows([]);
      setFileName(null);
      setConfirmImport(false);
      await onRefresh();
      setStepMessage(
        `Impor selesai (Langkah 8–9): ${res.importedCount} jemaat berhasil disimpan ke database, ${res.skippedCount} baris dilewati, dan dicatat ke audit log.`,
      );
    } catch (err) {
      setErrorMsg(extractUserErrorMessage(err, 'Gagal menyimpan impor batch.'));
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async (format: 'csv' | 'xlsx') => {
    if (busy || activeMembers.length === 0) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      if (format === 'csv') {
        await exportMembersAsCsv(churchId, membership, activeMembers);
      } else {
        await exportMembersAsXlsx(churchId, membership, activeMembers);
      }
      await onRefresh();
      setStepMessage(
        `Ekspor ${format.toUpperCase()} (${activeMembers.length} jemaat aktif) selesai dan dicatat ke audit log.`,
      );
    } catch (err) {
      setErrorMsg(extractUserErrorMessage(err, 'Gagal mengekspor data.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {stepMessage && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{stepMessage}</span>
        </div>
      )}
      {errorMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Export Section */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Ekspor Data Jemaat Privat
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Ekspor hanya mencakup data jemaat gereja aktif ini ({activeMembers.length} profil),
              diunduh langsung tanpa URL publik atau caching Service Worker.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || activeMembers.length === 0}
              onClick={() => void handleExport('csv')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Download className="h-3.5 w-3.5" />
              Ekspor CSV
            </button>
            <button
              type="button"
              disabled={busy || activeMembers.length === 0}
              onClick={() => void handleExport('xlsx')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F1E36] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#162A4A] disabled:opacity-50 dark:bg-violet-700 dark:hover:bg-violet-600"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Ekspor Excel (.xlsx)
            </button>
          </div>
        </div>
      </section>

      {/* 9-Step Import Wizard */}
      <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Impor Massal Jemaat (CSV &amp; Excel .xlsx)
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Alur 9 tahap: Unggah file → Cek format → Pratinjau data → Validasi field wajib →
              Deteksi duplikat → Perbaiki baris error → Konfirmasi Owner → Simpan batch → Log audit.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void downloadImportTemplateXlsx()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Download className="h-3.5 w-3.5" />
            Unduh Template .xlsx
          </button>
        </div>

        <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/60 p-6 text-center hover:border-[#0F1E36] hover:bg-[#EBF2FC]/30 dark:border-slate-700 dark:bg-slate-950/60 dark:hover:border-violet-500 dark:hover:bg-violet-950/20">
          <Upload className="h-6 w-6 text-[#0F1E36] dark:text-violet-400" />
          <span className="mt-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
            {fileName ? `File dimuat: ${fileName}` : 'Pilih file .csv atau .xlsx dari perangkat Anda'}
          </span>
          <span className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Kolom disarankan: Nama Lengkap, Nama Panggilan, Jenis Kelamin (L/P), Tanggal Lahir
            (YYYY-MM-DD), Telepon, Email, Alamat, Tanggal Anggota, Status
          </span>
          <input
            type="file"
            accept=".csv,.xlsx"
            className="hidden"
            onChange={(e) => void handleFileUpload(e.target.files?.[0] || null)}
          />
        </label>

        {rows.length > 0 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 px-4 py-3 text-xs dark:bg-slate-950/60">
              <div className="flex flex-wrap gap-4 text-slate-700 dark:text-slate-300">
                <span>
                  Siap impor:{' '}
                  <strong className="font-mono text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {validToImport.length}
                  </strong>
                </span>
                <span>
                  Perlu diperbaiki:{' '}
                  <strong className="font-mono text-rose-700 dark:text-rose-400 tabular-nums">
                    {errorRowsCount}
                  </strong>
                </span>
                <span>
                  Terdeteksi duplikat:{' '}
                  <strong className="font-mono text-amber-800 dark:text-amber-300 tabular-nums">
                    {duplicateRowsCount}
                  </strong>
                </span>
              </div>

              <button
                type="button"
                disabled={busy || validToImport.length === 0 || errorRowsCount > 0}
                onClick={() => setConfirmImport(true)}
                className="rounded-lg bg-[#0F1E36] px-4 py-2 text-xs font-medium text-white hover:bg-[#162A4A] disabled:opacity-40 dark:bg-violet-700 dark:hover:bg-violet-600"
              >
                Lanjut Konfirmasi ({validToImport.length} baris)
              </button>
            </div>

            {confirmImport && (
              <div
                role="alertdialog"
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs dark:border-amber-800/80 dark:bg-amber-950/40"
              >
                <p className="text-amber-950 dark:text-amber-100">
                  Konfirmasi Owner: Simpan <strong>{validToImport.length}</strong> data jemaat baru
                  ke ruang kerja gereja ini?{' '}
                  {duplicateRowsCount > 0 &&
                    '(Terdapat baris duplikat yang tidak dilewati — pastikan sudah diverifikasi.)'}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmImport(false)}
                    className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-medium text-amber-900 dark:border-amber-700 dark:bg-slate-900 dark:text-amber-200"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleExecuteImport()}
                    className="rounded-lg bg-[#0F1E36] px-3 py-1.5 font-medium text-white dark:bg-violet-700"
                  >
                    {busy ? 'Menyimpan...' : 'Ya, Impor Sekarang'}
                  </button>
                </div>
              </div>
            )}

            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2.5">Baris</th>
                    <th className="px-3 py-2.5">Nama Lengkap</th>
                    <th className="px-3 py-2.5">Telepon</th>
                    <th className="px-3 py-2.5">Email</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5">Validasi &amp; Duplikat</th>
                    <th className="px-3 py-2.5 text-right">Lewati</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rows.map((r, idx) => (
                    <tr
                      key={r.rowNumber}
                      className={r.skip ? 'bg-slate-50/70 opacity-60 dark:bg-slate-950/50' : ''}
                    >
                      <td className="px-3 py-2 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        #{r.rowNumber}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={r.fullName}
                          disabled={r.skip}
                          onChange={(e) => updateRowField(idx, {fullName: e.target.value})}
                          className="w-44 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={r.phone}
                          disabled={r.skip}
                          onChange={(e) => updateRowField(idx, {phone: e.target.value})}
                          className="w-32 rounded border border-slate-200 bg-white px-2 py-1 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="email"
                          value={r.email}
                          disabled={r.skip}
                          onChange={(e) => updateRowField(idx, {email: e.target.value})}
                          className="w-40 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={r.status}
                          disabled={r.skip}
                          onChange={(e) =>
                            updateRowField(idx, {
                              status: e.target.value as CongregationMemberStatus,
                            })
                          }
                          className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        >
                          {ALLOWED_MEMBER_STATUSES.map((st) => (
                            <option key={st} value={st}>
                              {getMemberStatusLabelID(st)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-[11px]">
                        {r.skip ? (
                          <span className="text-slate-500 dark:text-slate-400">Dilewati</span>
                        ) : r.errors.length > 0 ? (
                          <span className="font-medium text-rose-700 dark:text-rose-400">
                            {r.errors[0]}
                          </span>
                        ) : r.duplicateReason ? (
                          <span className="font-medium text-amber-800 dark:text-amber-300">
                            {r.duplicateReason}
                          </span>
                        ) : (
                          <span className="font-medium text-emerald-700 dark:text-emerald-400">
                            Valid
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="checkbox"
                          aria-label={`Lewati baris ${r.rowNumber}`}
                          checked={r.skip}
                          onChange={(e) => updateRowField(idx, {skip: e.target.checked})}
                          className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-900"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
