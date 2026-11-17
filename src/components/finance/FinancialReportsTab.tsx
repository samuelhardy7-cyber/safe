import React, {useMemo, useState} from 'react';
import {Download, Printer} from 'lucide-react';
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
  ChurchMembership,
  CurrencyCode,
  FinanceAccount,
  FinanceCategory,
  FinanceTransaction,
  FinanceTransactionStatus,
  FinanceTransactionType,
  FinanceViewId,
} from '../../types/domain';
import {
  formatCurrency,
  getAccountTypeLabelID,
  getTxStatusLabelID,
  getTxTypeLabelID,
} from '../../utils/formatting';

interface FinancialReportsTabProps {
  churchName: string;
  currency: CurrencyCode;
  membership: ChurchMembership;
  accounts: readonly FinanceAccount[];
  categories: readonly FinanceCategory[];
  transactions: readonly FinanceTransaction[];
  onNavigateView: (view: FinanceViewId) => void;
}

type ReportMode =
  | 'cashflow'
  | 'income'
  | 'expense'
  | 'accounts'
  | 'monthly'
  | 'annual'
  | 'by_category'
  | 'comparison'
  | 'history';

const REPORT_TYPES: Array<{id: ReportMode; label: string}> = [
  {id: 'cashflow', label: '1. Arus Kas (Cash Flow)'},
  {id: 'income', label: '2. Laporan Pemasukan'},
  {id: 'expense', label: '3. Laporan Pengeluaran'},
  {id: 'accounts', label: '4. Saldo per Akun'},
  {id: 'monthly', label: '5. Ringkasan Bulanan'},
  {id: 'annual', label: '6. Ringkasan Tahunan'},
  {id: 'by_category', label: '7. Rincian per Kategori'},
  {id: 'comparison', label: '8. Perbandingan Masuk vs Keluar'},
  {id: 'history', label: '9. Riwayat Lengkap Transaksi'},
];

export const FinancialReportsTab: React.FC<FinancialReportsTabProps> = ({
  churchName,
  currency,
  membership,
  accounts,
  categories,
  transactions,
  onNavigateView,
}) => {
  const canViewReports =
    hasFinancePermission(membership, 'finance.viewReports') ||
    hasFinancePermission(membership, 'finance.view');
  const canExport = hasFinancePermission(membership, 'finance.export');

  const todayStr = getJakartaDateString();
  const [reportMode, setReportMode] = useState<ReportMode>('cashflow');
  const [preset, setPreset] = useState<FinancePeriodPreset>('month');
  const [customStart, setCustomStart] = useState(`${todayStr.slice(0, 7)}-01`);
  const [customEnd, setCustomEnd] = useState(todayStr);
  const [accountFilter, setAccountFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState<'all' | FinanceTransactionType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'posted' | FinanceTransactionStatus>('all');
  const [hoveredMonth, setHoveredMonth] = useState<string | null>(null);

  const range = useMemo(
    () => resolveDateRange(preset, todayStr, customStart, customEnd),
    [preset, todayStr, customStart, customEnd],
  );

  const filteredTxs = useMemo(() => {
    const inPeriod = filterTransactionsByPeriod(transactions, range.startDate, range.endDate);
    return inPeriod.filter((tx) => {
      if (accountFilter && tx.accountId !== accountFilter && tx.toAccountId !== accountFilter)
        return false;
      if (categoryFilter && tx.categoryId !== categoryFilter) return false;
      if (reportMode === 'income' && tx.type !== 'income') return false;
      if (reportMode === 'expense' && tx.type !== 'expense') return false;
      if (txTypeFilter !== 'all' && tx.type !== txTypeFilter) return false;
      if (statusFilter === 'posted' && !isPostedStatus(tx.status)) return false;
      if (statusFilter !== 'all' && statusFilter !== 'posted' && tx.status !== statusFilter)
        return false;
      return true;
    });
  }, [
    transactions,
    range.startDate,
    range.endDate,
    accountFilter,
    categoryFilter,
    reportMode,
    txTypeFilter,
    statusFilter,
  ]);

  const postedTxs = useMemo(
    () => filteredTxs.filter((t) => isPostedStatus(t.status)),
    [filteredTxs],
  );

  const metrics = useMemo(
    () =>
      computeFinanceDashboardMetrics(
        accounts,
        filteredTxs,
        categories,
        range.startDate,
        range.endDate,
      ),
    [accounts, filteredTxs, categories, range.startDate, range.endDate],
  );

  const annualSeries = useMemo(() => {
    const map = new Map<string, {income: number; expense: number; count: number}>();
    for (const tx of transactions) {
      if (!isPostedStatus(tx.status) || tx.type === 'transfer') continue;
      const year = tx.date.slice(0, 4);
      const cur = map.get(year) || {income: 0, expense: 0, count: 0};
      if (tx.type === 'income') cur.income += tx.amount;
      if (tx.type === 'expense') cur.expense += tx.amount;
      cur.count += 1;
      map.set(year, cur);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([year, val]) => ({
        year,
        income: val.income,
        expense: val.expense,
        net: val.income - val.expense,
        count: val.count,
      }));
  }, [transactions]);

  if (!canViewReports) {
    return (
      <section className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
        Akses ditolak: Izin <span className="font-mono">finance.viewReports</span> diperlukan untuk
        membuka laporan keuangan.
      </section>
    );
  }

  const maxMonthly = Math.max(
    1,
    ...metrics.monthlySeries.flatMap((m) => [m.income, m.expense]),
  );

  return (
    <div className="space-y-6">
      {/* Controls & Selector Bar */}
      <section className="no-print space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Pusat Laporan Keuangan Gereja
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Data konsolidasi keuangan tanpa memaparkan identitas pribadi jemaat.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <Printer className="h-3.5 w-3.5" />
              Cetak / Print
            </button>
            {canExport && (
              <button
                type="button"
                onClick={() => onNavigateView('export')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F1E36] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#162A4A]"
              >
                <Download className="h-3.5 w-3.5" />
                Ekspor PDF / Excel / CSV
              </button>
            )}
          </div>
        </div>

        {/* 9 Report Type Buttons */}
        <div className="flex flex-wrap gap-1.5">
          {REPORT_TYPES.map((rt) => (
            <button
              key={rt.id}
              type="button"
              onClick={() => setReportMode(rt.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                reportMode === rt.id
                  ? 'bg-[#0F1E36] text-white dark:bg-violet-600'
                  : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {rt.label}
            </button>
          ))}
        </div>

        {/* Period & Filter Row (6 Dynamic Filters) */}
        <div className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-5 dark:border-slate-800">
          <select
            aria-label="Pilih periode laporan"
            value={preset}
            onChange={(e) => setPreset(e.target.value as FinancePeriodPreset)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          >
            <option value="today">Hari Ini</option>
            <option value="week">Minggu Ini</option>
            <option value="month">Bulan Ini</option>
            <option value="year">Tahun Ini</option>
            <option value="all">Semua Periode</option>
            <option value="custom">Rentang Khusus</option>
          </select>

          <select
            aria-label="Filter akun laporan"
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          >
            <option value="">Semua Akun</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter kategori laporan"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          >
            <option value="">Semua Kategori</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter jenis transaksi laporan"
            value={txTypeFilter}
            onChange={(e) => setTxTypeFilter(e.target.value as 'all' | FinanceTransactionType)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          >
            <option value="all">Semua Jenis Transaksi</option>
            <option value="income">Pemasukan</option>
            <option value="expense">Pengeluaran</option>
            <option value="transfer">Transfer Akun</option>
          </select>

          <select
            aria-label="Filter status transaksi laporan"
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as 'all' | 'posted' | FinanceTransactionStatus)
            }
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          >
            <option value="all">Semua Status</option>
            <option value="posted">Disetujui &amp; Terkunci</option>
            <option value="submitted">Menunggu Persetujuan</option>
            <option value="draft">Draf</option>
            <option value="rejected">Ditolak</option>
            <option value="voided">Dibatalkan (Void)</option>
          </select>
        </div>

        {preset === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="text-slate-500 dark:text-slate-400">Tanggal mulai:</label>
            <input
              type="date"
              aria-label="Tanggal mulai"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <label className="text-slate-500 dark:text-slate-400">Tanggal akhir:</label>
            <input
              type="date"
              aria-label="Tanggal akhir"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
        )}
      </section>

      {/* Printable Report Canvas */}
      <section className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
          <div>
            <p className="text-xs font-medium text-violet-700 dark:text-violet-400">
              {churchName} · Periode: {range.label}
            </p>
            <h3 className="mt-1 font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              {REPORT_TYPES.find((r) => r.id === reportMode)?.label}
            </h3>
          </div>

          <div className="flex flex-wrap gap-6 text-xs">
            <div>
              <p className="text-slate-500 dark:text-slate-400">Pemasukan Disetujui</p>
              <p className="font-mono text-base font-bold text-teal-700 tabular-nums dark:text-teal-400">
                {formatCurrency(metrics.periodIncome, currency)}
              </p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400">Pengeluaran Disetujui</p>
              <p className="font-mono text-base font-bold text-rose-700 tabular-nums dark:text-rose-400">
                {formatCurrency(metrics.periodExpense, currency)}
              </p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400">Surplus / Defisit</p>
              <p
                className={`font-mono text-base font-bold tabular-nums ${
                  metrics.netSurplus >= 0
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-rose-700 dark:text-rose-400'
                }`}
              >
                {formatCurrency(metrics.netSurplus, currency)}
              </p>
            </div>
          </div>
        </div>

        {/* Specific Report Body */}
        {(reportMode === 'comparison' || reportMode === 'cashflow' || reportMode === 'monthly') && (
          <div className="space-y-5">
            {metrics.monthlySeries.length > 0 && (
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Grafik Perbandingan Arus Kas Bulanan ({currency})
                  </p>
                  <div className="flex items-center gap-4 text-[11px] text-slate-600 dark:text-slate-300">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm bg-teal-600" />
                      Pemasukan
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm bg-rose-600" />
                      Pengeluaran
                    </span>
                  </div>
                </div>
                {hoveredMonth && (
                  <div className="mb-2 text-xs text-slate-700 dark:text-slate-300">
                    {(() => {
                      const pt = metrics.monthlySeries.find((m) => m.month === hoveredMonth);
                      if (!pt) return null;
                      return (
                        <span className="font-mono tabular-nums">
                          {pt.label}: Masuk {formatCurrency(pt.income, currency)} · Keluar{' '}
                          {formatCurrency(pt.expense, currency)} · Netto{' '}
                          {formatCurrency(pt.net, currency)}
                        </span>
                      );
                    })()}
                  </div>
                )}
                <svg viewBox="0 0 520 175" className="h-44 w-full" role="img" aria-label="Grafik perbandingan bulanan">
                  <line x1="0" y1="140" x2="520" y2="140" stroke="currentColor" strokeOpacity="0.15" />
                  {metrics.monthlySeries.map((pt, idx) => {
                    const colW = 520 / metrics.monthlySeries.length;
                    const barW = Math.min(26, colW * 0.28);
                    const hIn = Math.max(4, Math.round((pt.income / maxMonthly) * 115));
                    const hOut = Math.max(4, Math.round((pt.expense / maxMonthly) * 115));
                    const cx = idx * colW + colW / 2;
                    return (
                      <g
                        key={pt.month}
                        onMouseEnter={() => setHoveredMonth(pt.month)}
                        onMouseLeave={() => setHoveredMonth(null)}
                        className="cursor-pointer"
                      >
                        <rect x={cx - barW - 2} y={140 - hIn} width={barW} height={hIn} rx={3} fill="#0D9488" />
                        <rect x={cx + 2} y={140 - hOut} width={barW} height={hOut} rx={3} fill="#E11D48" />
                        <text x={cx} y={160} textAnchor="middle" fontSize="10" fill="#64748B">
                          {pt.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Bulan</th>
                    <th className="py-2 pr-3 text-right font-medium">Total Pemasukan</th>
                    <th className="py-2 pr-3 text-right font-medium">Total Pengeluaran</th>
                    <th className="py-2 text-right font-medium">Arus Kas Bersih</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {metrics.monthlySeries.map((m) => (
                    <tr key={m.month}>
                      <td className="py-2.5 pr-3 font-medium text-slate-900 dark:text-slate-100">
                        {m.label} ({m.month})
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono text-teal-700 tabular-nums dark:text-teal-400">
                        {formatCurrency(m.income, currency)}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono text-rose-700 tabular-nums dark:text-rose-400">
                        {formatCurrency(m.expense, currency)}
                      </td>
                      <td className="py-2.5 text-right font-mono font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                        {formatCurrency(m.net, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {reportMode === 'accounts' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <tr>
                  <th className="py-2 pr-3 font-medium">Nama Akun</th>
                  <th className="py-2 pr-3 font-medium">Jenis</th>
                  <th className="py-2 pr-3 text-right font-medium">Saldo Awal</th>
                  <th className="py-2 text-right font-medium">Saldo Saat Ini</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {accounts.map((acc) => (
                  <tr key={acc.id}>
                    <td className="py-2.5 pr-3 font-medium text-slate-900 dark:text-slate-100">
                      {acc.name}
                    </td>
                    <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">
                      {getAccountTypeLabelID(acc.accountType)}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono text-slate-600 tabular-nums dark:text-slate-300">
                      {formatCurrency(acc.openingBalance, acc.currency)}
                    </td>
                    <td className="py-2.5 text-right font-mono font-bold text-slate-900 tabular-nums dark:text-slate-100">
                      {formatCurrency(acc.currentBalance, acc.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {reportMode === 'annual' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <tr>
                  <th className="py-2 pr-3 font-medium">Tahun Fiskal</th>
                  <th className="py-2 pr-3 text-right font-medium">Jumlah Transaksi</th>
                  <th className="py-2 pr-3 text-right font-medium">Total Pemasukan</th>
                  <th className="py-2 pr-3 text-right font-medium">Total Pengeluaran</th>
                  <th className="py-2 text-right font-medium">Surplus / Defisit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {annualSeries.map((y) => (
                  <tr key={y.year}>
                    <td className="py-2.5 pr-3 font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {y.year}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      {y.count}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono text-teal-700 tabular-nums dark:text-teal-400">
                      {formatCurrency(y.income, currency)}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono text-rose-700 tabular-nums dark:text-rose-400">
                      {formatCurrency(y.expense, currency)}
                    </td>
                    <td className="py-2.5 text-right font-mono font-bold text-slate-900 tabular-nums dark:text-slate-100">
                      {formatCurrency(y.net, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {reportMode === 'by_category' && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h4 className="mb-3 text-xs font-semibold text-teal-800 dark:text-teal-300">
                Pemasukan per Kategori
              </h4>
              <ul className="space-y-2.5 text-xs">
                {metrics.incomeCategories.map((c) => (
                  <li key={c.categoryId} className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                    <span className="text-slate-800 dark:text-slate-200">
                      {c.categoryName} ({c.count} tx · {c.percentage}%)
                    </span>
                    <span className="font-mono font-semibold text-teal-700 tabular-nums dark:text-teal-400">
                      {formatCurrency(c.total, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="mb-3 text-xs font-semibold text-rose-800 dark:text-rose-300">
                Pengeluaran per Kategori
              </h4>
              <ul className="space-y-2.5 text-xs">
                {metrics.expenseCategories.map((c) => (
                  <li key={c.categoryId} className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                    <span className="text-slate-800 dark:text-slate-200">
                      {c.categoryName} ({c.count} tx · {c.percentage}%)
                    </span>
                    <span className="font-mono font-semibold text-rose-700 tabular-nums dark:text-rose-400">
                      {formatCurrency(c.total, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {(reportMode === 'income' || reportMode === 'expense' || reportMode === 'history') && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <tr>
                  <th className="py-2 pr-3 font-medium">Tanggal</th>
                  <th className="py-2 pr-3 font-medium">Kode</th>
                  <th className="py-2 pr-3 font-medium">Jenis &amp; Kategori</th>
                  <th className="py-2 pr-3 font-medium">Deskripsi</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 text-right font-medium">Nominal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(reportMode === 'history' ? filteredTxs : postedTxs).map((tx) => (
                  <tr key={tx.id}>
                    <td className="py-2 pr-3 font-mono text-slate-600 tabular-nums dark:text-slate-300">
                      {tx.date}
                    </td>
                    <td className="py-2 pr-3 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {tx.txCode}
                    </td>
                    <td className="py-2 pr-3 text-slate-800 dark:text-slate-200">
                      {getTxTypeLabelID(tx.type)} {tx.categoryName ? `· ${tx.categoryName}` : ''}
                    </td>
                    <td className="py-2 pr-3 text-slate-800 dark:text-slate-200">{tx.description}</td>
                    <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">
                      {getTxStatusLabelID(tx.status)}
                    </td>
                    <td className="py-2 text-right font-mono font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                      {formatCurrency(tx.amount, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
