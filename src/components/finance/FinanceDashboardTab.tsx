import React, {useMemo, useState} from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckSquare,
  Clock,
  Plus,
  Wallet,
} from 'lucide-react';
import {
  computeFinanceDashboardMetrics,
  filterTransactionsByPeriod,
  getJakartaDateString,
  resolveDateRange,
  type FinancePeriodPreset,
} from '../../domain/finance';
import {hasFinancePermission} from '../../domain/rbac';
import type {
  ChurchMembership,
  CurrencyCode,
  FinanceAccount,
  FinanceAuditLog,
  FinanceCategory,
  FinanceTransaction,
  FinanceViewId,
} from '../../types/domain';
import {
  formatCurrency,
  formatDateTimeID,
  getAccountTypeLabelID,
  getTxStatusLabelID,
} from '../../utils/formatting';

interface FinanceDashboardTabProps {
  churchName: string;
  currency: CurrencyCode;
  timezone: string;
  membership: ChurchMembership;
  accounts: readonly FinanceAccount[];
  categories: readonly FinanceCategory[];
  transactions: readonly FinanceTransaction[];
  auditLogs: readonly FinanceAuditLog[];
  lastSyncedAt?: Date | null;
  onNavigateView: (view: FinanceViewId) => void;
  onOpenNewTx: (type: 'income' | 'expense') => void;
}

const PERIOD_PRESETS: Array<{id: FinancePeriodPreset; label: string}> = [
  {id: 'today', label: 'Hari Ini'},
  {id: 'week', label: 'Minggu Ini'},
  {id: 'month', label: 'Bulan Ini'},
  {id: 'year', label: 'Tahun Ini'},
  {id: 'all', label: 'Semua'},
  {id: 'custom', label: 'Rentang Khusus'},
];

export const FinanceDashboardTab: React.FC<FinanceDashboardTabProps> = ({
  churchName,
  currency,
  timezone,
  membership,
  accounts,
  categories,
  transactions,
  auditLogs,
  lastSyncedAt,
  onNavigateView,
  onOpenNewTx,
}) => {
  const todayStr = getJakartaDateString();
  const [preset, setPreset] = useState<FinancePeriodPreset>('month');
  const [customStart, setCustomStart] = useState(`${todayStr.slice(0, 7)}-01`);
  const [customEnd, setCustomEnd] = useState(todayStr);
  const [hoveredMonth, setHoveredMonth] = useState<string | null>(null);

  const range = useMemo(
    () => resolveDateRange(preset, todayStr, customStart, customEnd),
    [preset, todayStr, customStart, customEnd],
  );

  const scopeMonthly = preset === 'year' || preset === 'custom' || preset === 'all';
  const metrics = useMemo(
    () =>
      computeFinanceDashboardMetrics(
        accounts,
        transactions,
        categories,
        range.startDate,
        range.endDate,
        scopeMonthly,
      ),
    [accounts, transactions, categories, range.startDate, range.endDate, scopeMonthly],
  );

  const recentTxs = useMemo(
    () => filterTransactionsByPeriod(transactions, range.startDate, range.endDate).slice(0, 6),
    [transactions, range.startDate, range.endDate],
  );

  const maxChartValue = Math.max(
    1,
    ...metrics.monthlySeries.flatMap((m) => [m.income, m.expense]),
  );

  const canCreate = hasFinancePermission(membership, 'finance.create');
  const canApprove = hasFinancePermission(membership, 'finance.approve');
  const activeAccounts = accounts.filter((a) => a.status !== 'archived');

  return (
    <div className="space-y-6">
      {/* Period Selector Bar */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3.5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {PERIOD_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPreset(p.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                preset === p.id
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          {preset === 'custom' ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                aria-label="Tanggal mulai periode"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <span className="text-slate-400">s/d</span>
              <input
                type="date"
                aria-label="Tanggal akhir periode"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          ) : (
            <p>
              Periode aktif: <span className="font-medium text-slate-700 dark:text-slate-200">{range.label}</span>
            </p>
          )}
          {lastSyncedAt && (
            <span className="font-mono text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
              · Diperbarui{' '}
              {new Intl.DateTimeFormat('id-ID', {
                timeZone: timezone || 'Asia/Jakarta',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              }).format(lastSyncedAt)}{' '}
              WIB
            </span>
          )}
        </div>
      </section>

      {/* Asymmetric Executive Hero Split (NOT uniform 4-card grid) */}
      <div className="grid gap-5 lg:grid-cols-12">
        {/* Dominant Net Balance Hero Panel */}
        <section className="flex flex-col justify-between rounded-xl bg-[#0F1E36] p-6 text-white lg:col-span-7 dark:border dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-blue-200/80">
                Total Saldo Likuid · {churchName}
              </p>
              <p className="mt-2 font-mono text-3xl font-bold tracking-tight tabular-nums sm:text-4xl">
                {formatCurrency(metrics.totalBalance, currency)}
              </p>
              <p className="mt-2 text-xs text-blue-100/75">
                Tersebar di {metrics.activeAccountsCount} akun aktif · Disetujui periode ini:{' '}
                <span className="font-mono font-medium text-white tabular-nums">
                  {metrics.approvedCount} transaksi
                </span>
              </p>
            </div>

            {canCreate && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onOpenNewTx('income')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-teal-500 whitespace-nowrap"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Catat Pemasukan
                </button>
                <button
                  type="button"
                  onClick={() => onOpenNewTx('expense')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3.5 py-2 text-xs font-medium text-white hover:bg-white/20 whitespace-nowrap"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Catat Pengeluaran
                </button>
              </div>
            )}
          </div>

          {/* Account quick balance strip */}
          <div className="mt-6 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-3">
            {activeAccounts.length === 0 ? (
              <div className="sm:col-span-3 flex items-center justify-between text-xs text-blue-100/80">
                <span>Belum ada akun kas atau bank yang terdaftar.</span>
                <button
                  type="button"
                  onClick={() => onNavigateView('accounts')}
                  className="font-medium text-amber-300 hover:underline"
                >
                  Buat Akun Pertama
                </button>
              </div>
            ) : (
              activeAccounts.slice(0, 3).map((acc) => (
                <div key={acc.id} className="min-w-0">
                  <p className="truncate text-[11px] text-blue-200/75">
                    {acc.name} · {getAccountTypeLabelID(acc.accountType)}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-sm font-semibold text-white tabular-nums">
                    {formatCurrency(acc.currentBalance, acc.currency)}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Income vs Expense & Surplus Dual Stack */}
        <div className="flex flex-col gap-4 lg:col-span-5">
          <div className="grid flex-1 gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => onNavigateView('income')}
              className="flex flex-col justify-between rounded-xl border border-teal-200 bg-teal-50/70 p-5 text-left transition-colors hover:bg-teal-50 dark:border-teal-900/60 dark:bg-teal-950/30 dark:hover:bg-teal-950/50"
            >
              <div className="flex items-center justify-between text-teal-800 dark:text-teal-300">
                <span className="text-xs font-semibold">Pemasukan ({range.label})</span>
                <ArrowDownLeft className="h-4 w-4" />
              </div>
              <p className="mt-3 font-mono text-xl font-bold text-teal-950 tabular-nums dark:text-teal-100">
                {formatCurrency(metrics.periodIncome, currency)}
              </p>
            </button>

            <button
              type="button"
              onClick={() => onNavigateView('expenses')}
              className="flex flex-col justify-between rounded-xl border border-rose-200 bg-rose-50/70 p-5 text-left transition-colors hover:bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/30 dark:hover:bg-rose-950/50"
            >
              <div className="flex items-center justify-between text-rose-800 dark:text-rose-300">
                <span className="text-xs font-semibold">Pengeluaran ({range.label})</span>
                <ArrowUpRight className="h-4 w-4" />
              </div>
              <p className="mt-3 font-mono text-xl font-bold text-rose-950 tabular-nums dark:text-rose-100">
                {formatCurrency(metrics.periodExpense, currency)}
              </p>
            </button>
          </div>

          <section className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Surplus / Defisit Bersih ({range.label})
              </p>
              <p
                className={`mt-1 font-mono text-xl font-bold tabular-nums ${
                  metrics.netSurplus >= 0
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-rose-700 dark:text-rose-400'
                }`}
              >
                {metrics.netSurplus >= 0 ? '+' : ''}
                {formatCurrency(metrics.netSurplus, currency)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateView('reports')}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              Lihat Laporan
            </button>
          </section>
        </div>
      </div>

      {/* Pending Approvals Alert Strip */}
      {metrics.pendingCount > 0 && (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-300 bg-amber-50 px-5 py-3.5 dark:border-amber-800/70 dark:bg-amber-950/30">
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
            <div className="text-xs">
              <p className="font-semibold text-amber-950 dark:text-amber-200">
                {metrics.pendingCount} transaksi menunggu persetujuan
              </p>
              <p className="text-amber-900/80 dark:text-amber-300/80">
                Total nilai tertunda:{' '}
                <span className="font-mono font-semibold tabular-nums">
                  {formatCurrency(metrics.pendingTotal, currency)}
                </span>
                <span aria-hidden="true"> · </span>
                Draf belum diajukan: {metrics.draftCount}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigateView(canApprove ? 'approvals' : 'transactions')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-amber-600 whitespace-nowrap"
          >
            <CheckSquare className="h-3.5 w-3.5" />
            {canApprove ? 'Buka Pusat Persetujuan' : 'Lihat Antrian Transaksi'}
          </button>
        </section>
      )}

      {/* Charts Section: Monthly Cashflow Comparison + Expense Composition */}
      <div className="grid gap-6 lg:grid-cols-12">
        <section className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Arus Kas Bulanan (Disetujui &amp; Terkunci)
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {scopeMonthly
                  ? `Data aktual periode ${range.label} (dalam ${currency}).`
                  : `Perbandingan pemasukan dan pengeluaran 6 bulan terakhir (dalam ${currency}).`}
              </p>
            </div>
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

          {metrics.monthlySeries.length === 0 ? (
            <div className="mt-8 rounded-lg border border-dashed border-slate-200 py-10 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
              Belum ada transaksi yang disetujui untuk menampilkan grafik arus kas bulanan.
            </div>
          ) : (
            <div className="mt-5">
              {hoveredMonth && (
                <div className="mb-2 text-xs text-slate-600 dark:text-slate-300">
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
              <svg
                viewBox="0 0 460 175"
                className="h-44 w-full"
                role="img"
                aria-label="Grafik perbandingan pemasukan dan pengeluaran bulanan"
              >
                <line x1="0" y1="140" x2="460" y2="140" stroke="currentColor" strokeOpacity="0.15" />
                {metrics.monthlySeries.map((pt, idx) => {
                  const colW = 460 / metrics.monthlySeries.length;
                  const barW = Math.min(22, colW * 0.28);
                  const hIn = Math.max(4, Math.round((pt.income / maxChartValue) * 115));
                  const hOut = Math.max(4, Math.round((pt.expense / maxChartValue) * 115));
                  const cx = idx * colW + colW / 2;
                  return (
                    <g
                      key={pt.month}
                      onMouseEnter={() => setHoveredMonth(pt.month)}
                      onMouseLeave={() => setHoveredMonth(null)}
                      className="cursor-pointer"
                    >
                      <rect
                        x={cx - barW - 2}
                        y={140 - hIn}
                        width={barW}
                        height={hIn}
                        rx={3}
                        fill="#0D9488"
                      />
                      <rect
                        x={cx + 2}
                        y={140 - hOut}
                        width={barW}
                        height={hOut}
                        rx={3}
                        fill="#E11D48"
                      />
                      <text
                        x={cx}
                        y={160}
                        textAnchor="middle"
                        fontSize="10"
                        fill="#64748B"
                      >
                        {pt.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          )}
        </section>

        {/* Expense Breakdown */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Pengeluaran per Kategori
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Alokasi dana periode {range.label}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateView('categories')}
              className="text-xs font-medium text-violet-700 hover:underline dark:text-violet-400"
            >
              Kelola Kategori
            </button>
          </div>

          {metrics.expenseCategories.length === 0 ? (
            <p className="mt-8 text-xs text-slate-500 dark:text-slate-400">
              Belum ada pengeluaran disetujui pada periode ini.
            </p>
          ) : (
            <ul className="mt-5 space-y-3.5">
              {metrics.expenseCategories.slice(0, 5).map((cat) => (
                <li key={cat.categoryId} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-medium text-slate-800 dark:text-slate-200">
                      {cat.categoryName}
                    </span>
                    <span className="shrink-0 font-mono text-slate-600 tabular-nums dark:text-slate-300">
                      {formatCurrency(cat.total, currency)} ({cat.percentage}%)
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(5, cat.percentage)}%`,
                        backgroundColor: cat.color || '#BE123C',
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Bottom Split: Recent Transactions & Activity Timeline */}
      <div className="grid gap-6 lg:grid-cols-12">
        <section className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Transaksi Terbaru ({range.label})
            </h2>
            <button
              type="button"
              onClick={() => onNavigateView('transactions')}
              className="text-xs font-medium text-violet-700 hover:underline dark:text-violet-400"
            >
              Buka Semua Transaksi
            </button>
          </div>

          {recentTxs.length === 0 ? (
            <div className="mt-6 rounded-lg border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <p>Belum ada transaksi pada periode {range.label}.</p>
              {canCreate && (
                <button
                  type="button"
                  onClick={() => onOpenNewTx('income')}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#0F1E36] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#162A4A]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Catat Transaksi Pertama
                </button>
              )}
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
              {recentTxs.map((tx) => (
                <li key={tx.id} className="flex items-center justify-between gap-4 py-3 text-xs">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                      {tx.description}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="font-mono">{tx.txCode}</span>
                      <span aria-hidden="true"> · </span>
                      <span className="tabular-nums">{tx.date}</span>
                      <span aria-hidden="true"> · </span>
                      <span>{tx.accountName}</span>
                      <span aria-hidden="true"> · </span>
                      <span>{getTxStatusLabelID(tx.status)}</span>
                    </p>
                  </div>
                  <p
                    className={`shrink-0 font-mono font-semibold tabular-nums ${
                      tx.type === 'income'
                        ? 'text-teal-700 dark:text-teal-400'
                        : tx.type === 'expense'
                          ? 'text-rose-700 dark:text-rose-400'
                          : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}
                    {formatCurrency(tx.amount, currency)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Aktivitas Keuangan Terbaru
            </h2>
            <button
              type="button"
              onClick={() => onNavigateView('audit')}
              className="text-xs font-medium text-violet-700 hover:underline dark:text-violet-400"
            >
              Audit Log
            </button>
          </div>

          {auditLogs.length === 0 ? (
            <div className="mt-6 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Wallet className="h-4 w-4 shrink-0" />
              <span>Belum ada aktivitas keuangan tercatat.</span>
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
              {auditLogs.slice(0, 5).map((log) => (
                <li key={log.id} className="py-3 text-xs">
                  <p className="font-medium text-slate-900 dark:text-slate-100">{log.summary}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <span>{log.actorEmail}</span>
                    <span aria-hidden="true"> · </span>
                    <span className="tabular-nums">
                      {formatDateTimeID(log.createdAt, timezone)}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};
