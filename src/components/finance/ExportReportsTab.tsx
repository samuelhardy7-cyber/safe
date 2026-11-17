import React, {useMemo, useState} from 'react';
import {FileSpreadsheet, FileText, Lock, ShieldCheck, Table} from 'lucide-react';
import {
  computeFinanceDashboardMetrics,
  filterTransactionsByPeriod,
  getJakartaDateString,
  isPostedStatus,
  resolveDateRange,
  type FinancePeriodPreset,
} from '../../domain/finance';
import {hasFinancePermission} from '../../domain/rbac';
import type {
  Church,
  ChurchMembership,
  FinanceAccount,
  FinanceCategory,
  FinanceTransaction,
} from '../../types/domain';
import {
  exportFinanceAsCsv,
  exportFinanceAsPdf,
  exportFinanceAsXlsx,
} from '../../utils/financeExport';
import {formatCurrency} from '../../utils/formatting';
import {extractUserErrorMessage} from '../../utils/firestoreErrors';

interface ExportReportsTabProps {
  church: Church;
  membership: ChurchMembership;
  accounts: readonly FinanceAccount[];
  categories: readonly FinanceCategory[];
  transactions: readonly FinanceTransaction[];
  onNotice: (msg: string) => void;
  onError: (msg: string) => void;
}

export const ExportReportsTab: React.FC<ExportReportsTabProps> = ({
  church,
  membership,
  accounts,
  categories,
  transactions,
  onNotice,
  onError,
}) => {
  const canExport = hasFinancePermission(membership, 'finance.export');
  const todayStr = getJakartaDateString();

  const [preset, setPreset] = useState<FinancePeriodPreset>('month');
  const [customStart, setCustomStart] = useState(`${todayStr.slice(0, 7)}-01`);
  const [customEnd, setCustomEnd] = useState(todayStr);
  const [txScope, setTxScope] = useState<'all' | 'income' | 'expense'>('all');
  const [statusScope, setStatusScope] = useState<'posted_only' | 'all_statuses'>('posted_only');
  const [exporting, setExporting] = useState<'pdf' | 'xlsx' | 'csv' | null>(null);

  const range = useMemo(
    () => resolveDateRange(preset, todayStr, customStart, customEnd),
    [preset, todayStr, customStart, customEnd],
  );

  const exportRows = useMemo(() => {
    const inPeriod = filterTransactionsByPeriod(transactions, range.startDate, range.endDate);
    return inPeriod.filter((tx) => {
      if (txScope === 'income' && tx.type !== 'income') return false;
      if (txScope === 'expense' && tx.type !== 'expense') return false;
      if (statusScope === 'posted_only' && !isPostedStatus(tx.status)) return false;
      return true;
    });
  }, [transactions, range.startDate, range.endDate, txScope, statusScope]);

  const metrics = useMemo(
    () =>
      computeFinanceDashboardMetrics(
        accounts,
        exportRows,
        categories,
        range.startDate,
        range.endDate,
      ),
    [accounts, exportRows, categories, range.startDate, range.endDate],
  );

  if (!canExport) {
    return (
      <section className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
        <div className="flex items-center gap-2 font-semibold">
          <Lock className="h-4 w-4" />
          <span>Akses Ekspor Diblokir</span>
        </div>
        <p className="mt-1">
          Pengguna tanpa izin eksplisit <span className="font-mono">finance.export</span> tidak
          diperbolehkan mengunduh laporan PDF, Excel, atau CSV.
        </p>
      </section>
    );
  }

  const runExport = async (format: 'pdf' | 'xlsx' | 'csv') => {
    setExporting(format);
    try {
      const reportTitle =
        txScope === 'income'
          ? 'Laporan Pemasukan Gereja'
          : txScope === 'expense'
            ? 'Laporan Pengeluaran Gereja'
            : 'Laporan Keuangan Lengkap Gereja';

      const opts = {
        church,
        membership,
        reportTitle,
        periodLabel: range.label,
        transactions: exportRows,
        accounts,
        totalIncome: metrics.periodIncome,
        totalExpense: metrics.periodExpense,
        netSurplus: metrics.netSurplus,
        totalBalance: metrics.totalBalance,
      };

      if (format === 'pdf') await exportFinanceAsPdf(opts);
      if (format === 'xlsx') await exportFinanceAsXlsx(opts);
      if (format === 'csv') await exportFinanceAsCsv(opts);

      onNotice(
        `Berhasil mengekspor ${exportRows.length} baris laporan dalam format ${format.toUpperCase()} dan dicatat di Audit Log.`,
      );
    } catch (err) {
      onError(extractUserErrorMessage(err, `Gagal mengekspor laporan ${format.toUpperCase()}.`));
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
          Konfigurasi Cakupan Ekspor Laporan
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Setiap pengunduhan laporan PDF, Excel, atau CSV dicatat permanen dalam Audit Log
          keuangan.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="exp-preset" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Periode Laporan
            </label>
            <select
              id="exp-preset"
              value={preset}
              onChange={(e) => setPreset(e.target.value as FinancePeriodPreset)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="today">Hari Ini</option>
              <option value="week">Minggu Ini</option>
              <option value="month">Bulan Ini</option>
              <option value="year">Tahun Ini</option>
              <option value="all">Semua Periode</option>
              <option value="custom">Rentang Khusus</option>
            </select>
          </div>

          <div>
            <label htmlFor="exp-scope" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Jenis Transaksi
            </label>
            <select
              id="exp-scope"
              value={txScope}
              onChange={(e) => setTxScope(e.target.value as 'all' | 'income' | 'expense')}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="all">Semua Jenis (Masuk, Keluar, Transfer)</option>
              <option value="income">Hanya Pemasukan</option>
              <option value="expense">Hanya Pengeluaran</option>
            </select>
          </div>

          <div>
            <label htmlFor="exp-status" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Filter Status Persetujuan
            </label>
            <select
              id="exp-status"
              value={statusScope}
              onChange={(e) => setStatusScope(e.target.value as 'posted_only' | 'all_statuses')}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="posted_only">Hanya Disetujui &amp; Terkunci</option>
              <option value="all_statuses">Semua Status (Termasuk Draf &amp; Void)</option>
            </select>
          </div>

          <div className="rounded-lg border border-slate-100 bg-slate-50 px-3.5 py-2 dark:border-slate-800 dark:bg-slate-950">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Baris Siap Diekspor</p>
            <p className="mt-0.5 font-mono text-base font-bold text-slate-900 tabular-nums dark:text-slate-100">
              {exportRows.length} transaksi
            </p>
            <p className="font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
              Netto: {formatCurrency(metrics.netSurplus, church.currency)}
            </p>
          </div>
        </div>

        {preset === 'custom' && (
          <div className="mt-3 flex flex-wrap gap-3">
            <input
              type="date"
              aria-label="Tanggal mulai ekspor"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <input
              type="date"
              aria-label="Tanggal akhir ekspor"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
        )}
      </section>

      {/* 3 Distinct Format Export Cards */}
      <div className="grid gap-5 md:grid-cols-3">
        <article className="flex flex-col justify-between rounded-xl border border-rose-200 bg-rose-50/40 p-6 dark:border-rose-900/50 dark:bg-rose-950/20">
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-700 text-white">
              <FileText className="h-5 w-5" />
            </div>
            <h3 className="mt-4 font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Laporan PDF Resmi
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Dokumen A4 lanskap siap cetak dengan ringkasan pemasukan, pengeluaran, surplus, dan
              tabel transaksi lengkap.
            </p>
          </div>
          <button
            type="button"
            disabled={exporting !== null}
            onClick={() => void runExport('pdf')}
            className="mt-5 rounded-lg bg-rose-700 px-4 py-2 text-xs font-medium text-white hover:bg-rose-600 disabled:opacity-50"
          >
            {exporting === 'pdf' ? 'Menyusun PDF...' : 'Unduh PDF'}
          </button>
        </article>

        <article className="flex flex-col justify-between rounded-xl border border-emerald-200 bg-emerald-50/40 p-6 dark:border-emerald-900/50 dark:bg-emerald-950/20">
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-700 text-white">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <h3 className="mt-4 font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Workbook Excel (.XLSX)
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Lembar kerja Excel asli dengan nominal bilangan bulat numerik untuk analisis audit atau
              rekonsiliasi bendahara.
            </p>
          </div>
          <button
            type="button"
            disabled={exporting !== null}
            onClick={() => void runExport('xlsx')}
            className="mt-5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            {exporting === 'xlsx' ? 'Menyusun Excel...' : 'Unduh Excel (.xlsx)'}
          </button>
        </article>

        <article className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0F1E36] text-white">
              <Table className="h-5 w-5" />
            </div>
            <h3 className="mt-4 font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Arsip CSV Aman (UTF-8)
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Data tabular ringan dengan proteksi injeksi rumus CSV dan pemisah standar UTF-8 BOM.
            </p>
          </div>
          <button
            type="button"
            disabled={exporting !== null}
            onClick={() => void runExport('csv')}
            className="mt-5 rounded-lg bg-[#0F1E36] px-4 py-2 text-xs font-medium text-white hover:bg-[#162A4A] disabled:opacity-50"
          >
            {exporting === 'csv' ? 'Menyusun CSV...' : 'Unduh CSV'}
          </button>
        </article>
      </div>

      <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <ShieldCheck className="h-4 w-4 text-teal-700 dark:text-teal-400" />
        <span>
          Proteksi Privasi Jemaat: File ekspor hanya memuat kode referensi anonim, bukan nama atau
          data kontak jemaat.
        </span>
      </p>
    </div>
  );
};
