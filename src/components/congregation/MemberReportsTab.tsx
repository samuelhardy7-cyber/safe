import React, {useState} from 'react';
import {Download, FileSpreadsheet, ShieldCheck} from 'lucide-react';
import {computeCongregationStats} from '../../domain/congregation';
import type {ChurchMembership, CongregationMember, FamilyGroup} from '../../types/domain';
import {exportMembersAsCsv, exportMembersAsXlsx} from '../../utils/congregationExport';
import {extractUserErrorMessage} from '../../utils/firestoreErrors';

interface MemberReportsTabProps {
  churchId: string;
  churchName: string;
  membership: ChurchMembership;
  members: readonly CongregationMember[];
  families: readonly FamilyGroup[];
  onRefresh: () => Promise<void>;
}

export const MemberReportsTab: React.FC<MemberReportsTabProps> = ({
  churchId,
  churchName,
  membership,
  members,
  families,
  onRefresh,
}) => {
  const [includeArchived, setIncludeArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const stats = computeCongregationStats(members, families);
  const nonArchived = members.filter((m) => !m.archived);
  const maleCount = nonArchived.filter((m) => m.gender === 'L').length;
  const femaleCount = nonArchived.filter((m) => m.gender === 'P').length;
  const unspecifiedGenderCount = nonArchived.length - maleCount - femaleCount;
  const linkedFamilyCount = nonArchived.filter((m) => Boolean(m.familyGroupId)).length;

  const exportTarget = includeArchived ? members : nonArchived;

  const handleExport = async (format: 'csv' | 'xlsx') => {
    if (busy || exportTarget.length === 0) return;
    setBusy(true);
    setStatusMsg(null);
    setErrorMsg(null);
    try {
      if (format === 'csv') {
        await exportMembersAsCsv(churchId, membership, exportTarget, 'laporan_jemaat');
      } else {
        await exportMembersAsXlsx(churchId, membership, exportTarget, 'laporan_jemaat');
      }
      await onRefresh();
      setStatusMsg(
        `Laporan privat ${format.toUpperCase()} (${exportTarget.length} data jemaat) berhasil diunduh dan dicatat ke audit log.`,
      );
    } catch (err) {
      setErrorMsg(extractUserErrorMessage(err, 'Gagal mengekspor laporan jemaat.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-700 dark:text-violet-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              Laporan Rahasia Khusus Church Owner
            </p>
            <h2 className="mt-1 font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              Laporan Statistik &amp; Keanggotaan · {churchName}
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              File laporan dihasilkan langsung di sesi terotorisasi Owner tanpa tautan publik dan
              tidak disimpan pada cache browser.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy || exportTarget.length === 0}
              onClick={() => void handleExport('csv')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Download className="h-3.5 w-3.5" />
              Unduh CSV
            </button>
            <button
              type="button"
              disabled={busy || exportTarget.length === 0}
              onClick={() => void handleExport('xlsx')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F1E36] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#162A4A] disabled:opacity-50 dark:bg-violet-700 dark:hover:bg-violet-600"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Unduh Excel (.xlsx)
            </button>
          </div>
        </div>

        <label className="mt-4 inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-900"
          />
          Sertakan anggota yang sudah diarsipkan dalam ekspor laporan ({stats.archived} profil)
        </label>

        {statusMsg && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            {statusMsg}
          </div>
        )}
        {errorMsg && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
            {errorMsg}
          </div>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Ringkasan Demografi &amp; Keluarga
          </h3>
          <dl className="mt-4 divide-y divide-slate-100 text-xs dark:divide-slate-800">
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Total Jemaat Non-Arsip</dt>
              <dd className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {stats.totalNonArchived}
              </dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Laki-laki</dt>
              <dd className="font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                {maleCount}
              </dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Perempuan</dt>
              <dd className="font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                {femaleCount}
              </dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Jenis Kelamin Tidak Ditentukan</dt>
              <dd className="font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                {unspecifiedGenderCount}
              </dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Terhubung Kelompok Keluarga</dt>
              <dd className="font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                {linkedFamilyCount} / {stats.totalNonArchived}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Rincian Status Keanggotaan
          </h3>
          <dl className="mt-4 divide-y divide-slate-100 text-xs dark:divide-slate-800">
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Aktif</dt>
              <dd className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                {stats.active}
              </dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Nonaktif</dt>
              <dd className="font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                {stats.inactive}
              </dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Tamu / Simpatisan</dt>
              <dd className="font-mono text-violet-700 dark:text-violet-400 tabular-nums">
                {stats.visiting}
              </dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Pindah Gereja</dt>
              <dd className="font-mono text-amber-700 dark:text-amber-400 tabular-nums">
                {stats.moved}
              </dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Meninggal Dunia</dt>
              <dd className="font-mono text-rose-700 dark:text-rose-400 tabular-nums">
                {stats.deceased}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
};
