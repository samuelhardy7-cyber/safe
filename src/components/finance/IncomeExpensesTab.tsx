import React, {useMemo, useState} from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  CreditCard,
  Plus,
  Receipt,
  Search,
  ShieldCheck,
} from 'lucide-react';
import {isPostedStatus} from '../../domain/finance';
import {hasFinancePermission} from '../../domain/rbac';
import type {
  ChurchMembership,
  CurrencyCode,
  FinanceAccount,
  FinanceCategory,
  FinancePaymentMethod,
  FinanceTransaction,
} from '../../types/domain';
import {
  formatCurrency,
  getPaymentMethodLabelID,
  getTxStatusLabelID,
} from '../../utils/formatting';

interface IncomeExpensesTabProps {
  mode: 'income' | 'expense';
  currency: CurrencyCode;
  membership: ChurchMembership;
  accounts: readonly FinanceAccount[];
  categories: readonly FinanceCategory[];
  transactions: readonly FinanceTransaction[];
  onOpenNewTx: (type: 'income' | 'expense') => void;
  onEditDraft: (tx: FinanceTransaction) => void;
}

export const IncomeExpensesTab: React.FC<IncomeExpensesTabProps> = ({
  mode,
  currency,
  membership,
  accounts,
  categories,
  transactions,
  onOpenNewTx,
  onEditDraft,
}) => {
  const [searchText, setSearchText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [hoveredMonth, setHoveredMonth] = useState<string | null>(null);

  const isIncome = mode === 'income';
  const canCreate = hasFinancePermission(membership, 'finance.create');
  const canEditDraft = hasFinancePermission(membership, 'finance.editDraft');

  const modeCategories = useMemo(
    () => categories.filter((c) => c.type === mode && c.status === 'active'),
    [categories, mode],
  );

  const catColorMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories) m.set(c.id, c.color);
    return m;
  }, [categories]);

  const filteredTxs = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (tx.type !== mode) return false;
      if (categoryFilter && tx.categoryId !== categoryFilter) return false;
      if (accountFilter && tx.accountId !== accountFilter) return false;
      if (!q) return true;
      return (
        tx.txCode.toLowerCase().includes(q) ||
        tx.description.toLowerCase().includes(q) ||
        (tx.anonymousRefCode || '').toLowerCase().includes(q) ||
        (tx.counterparty || '').toLowerCase().includes(q) ||
        (tx.receiptNumber || '').toLowerCase().includes(q)
      );
    });
  }, [transactions, mode, categoryFilter, accountFilter, searchText]);

  const postedTxs = filteredTxs.filter((tx) => isPostedStatus(tx.status));
  const totalPosted = postedTxs.reduce((acc, tx) => acc + tx.amount, 0);
  const totalPending = filteredTxs
    .filter((tx) => tx.status === 'submitted')
    .reduce((acc, tx) => acc + tx.amount, 0);

  // Build 6-month trend bars for Income view
  const trendBars = useMemo(() => {
    const map = new Map<string, {total: number; count: number}>();
    for (const tx of postedTxs) {
      const ym = tx.date.slice(0, 7);
      const cur = map.get(ym) || {total: 0, count: 0};
      cur.total += tx.amount;
      cur.count += 1;
      map.set(ym, cur);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([ym, info]) => ({ym, total: info.total, count: info.count}));
  }, [postedTxs]);
  const maxTrend = Math.max(1, ...trendBars.map((t) => t.total));

  // Category totals with color & percentage share
  const catTotals = useMemo(() => {
    const map = new Map<string, {name: string; color: string; total: number; count: number}>();
    for (const tx of postedTxs) {
      const name = tx.categoryName || 'Tanpa Kategori';
      const color =
        (tx.categoryId && catColorMap.get(tx.categoryId)) ||
        (isIncome ? '#0F766E' : '#BE123C');
      const cur = map.get(name) || {name, color, total: 0, count: 0};
      cur.total += tx.amount;
      cur.count += 1;
      map.set(name, cur);
    }
    return Array.from(map.values())
      .map((item) => ({
        ...item,
        percentage: totalPosted > 0 ? Math.round((item.total / totalPosted) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [postedTxs, catColorMap, isIncome, totalPosted]);

  // Income-specific: Payment channel breakdown & anonymous ref stats
  const paymentChannels = useMemo(() => {
    const map = new Map<FinancePaymentMethod, {total: number; count: number}>();
    for (const tx of postedTxs) {
      const cur = map.get(tx.paymentMethod) || {total: 0, count: 0};
      cur.total += tx.amount;
      cur.count += 1;
      map.set(tx.paymentMethod, cur);
    }
    return Array.from(map.entries())
      .map(([method, info]) => ({
        method,
        total: info.total,
        count: info.count,
        pct: totalPosted > 0 ? Math.round((info.total / totalPosted) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [postedTxs, totalPosted]);

  const anonymousRefCount = useMemo(
    () => filteredTxs.filter((tx) => Boolean(tx.anonymousRefCode?.trim())).length,
    [filteredTxs],
  );

  // Expense-specific: Top vendors & receipt compliance stats
  const topVendors = useMemo(() => {
    const map = new Map<string, {name: string; total: number; count: number; withProof: number}>();
    for (const tx of postedTxs) {
      const vendor = (tx.counterparty || '').trim() || 'Pengeluaran Langsung / Non-Vendor';
      const hasProof = (tx.attachments?.length ?? 0) > 0 || Boolean(tx.receiptNumber?.trim());
      const cur = map.get(vendor) || {name: vendor, total: 0, count: 0, withProof: 0};
      cur.total += tx.amount;
      cur.count += 1;
      if (hasProof) cur.withProof += 1;
      map.set(vendor, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [postedTxs]);

  const expenseReceiptCoverage = useMemo(() => {
    if (filteredTxs.length === 0) return 100;
    const withProof = filteredTxs.filter(
      (tx) => (tx.attachments?.length ?? 0) > 0 || Boolean(tx.receiptNumber?.trim()),
    ).length;
    return Math.round((withProof / filteredTxs.length) * 100);
  }, [filteredTxs]);

  return (
    <div className="space-y-6">
      {/* Mode-Tailored Banner: Calm Teal Inflow vs Structured Rose/Slate Expenditure Control */}
      <section
        className={`rounded-xl border p-6 ${
          isIncome
            ? 'border-teal-200 bg-gradient-to-br from-teal-50 via-white to-sky-50 dark:border-teal-900/60 dark:from-teal-950/40 dark:via-slate-900 dark:to-slate-900'
            : 'border-rose-200 bg-gradient-to-br from-rose-50 via-white to-slate-50 dark:border-rose-900/60 dark:from-rose-950/35 dark:via-slate-900 dark:to-slate-900'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              {isIncome ? (
                <ArrowDownLeft className="h-5 w-5 text-teal-700 dark:text-teal-400" />
              ) : (
                <ArrowUpRight className="h-5 w-5 text-rose-700 dark:text-rose-400" />
              )}
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                {isIncome ? 'Pencatatan & Analisis Pemasukan' : 'Kontrol & Alokasi Pengeluaran'}
              </h2>
            </div>
            <p className="mt-1 max-w-2xl text-xs text-slate-600 dark:text-slate-400">
              {isIncome
                ? 'Catat persembahan, perpuluhan, dan dana misi melalui berbagai kanal penerimaan dengan kode referensi donatur anonim tanpa mengekspos identitas jemaat.'
                : 'Pantau alokasi pos pengeluaran operasional, diakonia, dan pemeliharaan aset beserta kepatuhan kwitansi dan vendor penerima.'}
            </p>
          </div>

          {canCreate && (
            <button
              type="button"
              onClick={() => onOpenNewTx(mode)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium text-white whitespace-nowrap ${
                isIncome ? 'bg-teal-700 hover:bg-teal-600' : 'bg-rose-700 hover:bg-rose-600'
              }`}
            >
              <Plus className="h-3.5 w-3.5" />
              {isIncome ? 'Catat Pemasukan Baru' : 'Catat Pengeluaran Baru'}
            </button>
          )}
        </div>

        <div className="mt-5 grid gap-4 border-t border-slate-200/70 pt-4 sm:grid-cols-3 dark:border-slate-800">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Total Disetujui (Filter Aktif)
            </p>
            <p
              className={`mt-1 font-mono text-2xl font-bold tabular-nums ${
                isIncome ? 'text-teal-800 dark:text-teal-300' : 'text-rose-800 dark:text-rose-300'
              }`}
            >
              {formatCurrency(totalPosted, currency)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Menunggu Persetujuan</p>
            <p className="mt-1 font-mono text-xl font-semibold text-amber-700 tabular-nums dark:text-amber-400">
              {formatCurrency(totalPending, currency)}
            </p>
          </div>
          {isIncome ? (
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pencatatan &amp; Ref Donatur Anonim
              </p>
              <p className="mt-1 flex items-center gap-2 font-mono text-xl font-semibold text-slate-800 tabular-nums dark:text-slate-200">
                <span>{filteredTxs.length} tx</span>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 dark:text-teal-400">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {anonymousRefCount} ref anonim
                </span>
              </p>
            </div>
          ) : (
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Kelengkapan Bukti / No. Kwitansi
              </p>
              <p className="mt-1 flex items-center gap-2 font-mono text-xl font-semibold text-slate-800 tabular-nums dark:text-slate-200">
                <span>{expenseReceiptCoverage}%</span>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <Receipt className="h-3.5 w-3.5" />
                  dari {filteredTxs.length} transaksi
                </span>
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Distinct Analytical Compositions per Page Function */}
      {isIncome ? (
        <div className="grid gap-6 lg:grid-cols-12">
          <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Tren Pemasukan Bulanan ({currency})
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Arahkan kursor ke batang grafik untuk melihat nominal per bulan.
                </p>
              </div>
              {hoveredMonth && (
                <span className="font-mono text-xs font-semibold text-teal-700 tabular-nums dark:text-teal-400">
                  {hoveredMonth}:{' '}
                  {formatCurrency(
                    trendBars.find((b) => b.ym === hoveredMonth)?.total || 0,
                    currency,
                  )}
                </span>
              )}
            </div>
            {trendBars.length === 0 ? (
              <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">
                Belum ada pemasukan disetujui untuk menampilkan grafik tren.
              </p>
            ) : (
              <svg
                viewBox="0 0 420 148"
                className="mt-4 h-38 w-full"
                role="img"
                aria-label="Grafik tren pemasukan bulanan"
              >
                <line x1="0" y1="115" x2="420" y2="115" stroke="currentColor" strokeOpacity="0.12" />
                {trendBars.map((b, idx) => {
                  const colW = 420 / trendBars.length;
                  const barW = Math.min(38, colW * 0.5);
                  const h = Math.max(6, Math.round((b.total / maxTrend) * 95));
                  const x = idx * colW + (colW - barW) / 2;
                  return (
                    <g
                      key={b.ym}
                      onMouseEnter={() => setHoveredMonth(b.ym)}
                      onMouseLeave={() => setHoveredMonth(null)}
                      className="cursor-pointer"
                    >
                      <rect
                        x={x}
                        y={115 - h}
                        width={barW}
                        height={h}
                        rx={4}
                        fill={hoveredMonth === b.ym ? '#14B8A6' : '#0F766E'}
                      />
                      <text x={x + barW / 2} y={134} textAnchor="middle" fontSize="10" fill="#64748B">
                        {b.ym}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-teal-700 dark:text-teal-400" />
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Kanal Penerimaan &amp; Sumber Utama
              </h3>
            </div>
            {paymentChannels.length === 0 ? (
              <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">
                Belum ada pemasukan disetujui pada filter saat ini.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {paymentChannels.map((ch) => (
                  <div key={ch.method} className="space-y-1 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {getPaymentMethodLabelID(ch.method)} ({ch.count} tx)
                      </span>
                      <span className="font-mono font-semibold text-teal-800 tabular-nums dark:text-teal-300">
                        {formatCurrency(ch.total, currency)} · {ch.pct}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-teal-600"
                        style={{width: `${Math.max(5, ch.pct)}%`}}
                      />
                    </div>
                  </div>
                ))}
                {catTotals.length > 0 && (
                  <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      Kategori Pemasukan Teratas
                    </p>
                    <p className="mt-1 text-xs font-medium text-slate-800 dark:text-slate-200">
                      {catTotals[0].name} —{' '}
                      <span className="font-mono tabular-nums">
                        {formatCurrency(catTotals[0].total, currency)} ({catTotals[0].percentage}%)
                      </span>
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-12">
          <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-6 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Komposisi Alokasi Pos Pengeluaran
            </h3>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              Proporsi penggunaan dana gereja per kategori belanja yang telah disetujui.
            </p>
            {catTotals.length === 0 ? (
              <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">
                Belum ada pengeluaran disetujui pada filter saat ini.
              </p>
            ) : (
              <ul className="mt-4 space-y-3 text-xs">
                {catTotals.slice(0, 6).map((item) => (
                  <li key={item.name} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-slate-800 dark:text-slate-200">
                        {item.name} ({item.count} tx)
                      </span>
                      <span className="shrink-0 font-mono font-semibold text-rose-800 tabular-nums dark:text-rose-300">
                        {formatCurrency(item.total, currency)} ({item.percentage}%)
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(5, item.percentage)}%`,
                          backgroundColor: item.color || '#BE123C',
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-rose-700 dark:text-rose-400" />
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Vendor / Penerima Dana Teratas
              </h3>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              Rekap pihak penerima pembayaran beserta jumlah dokumen kwitansi yang terverifikasi.
            </p>
            {topVendors.length === 0 ? (
              <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">
                Belum ada catatan pengeluaran vendor pada filter saat ini.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-slate-100 text-xs dark:divide-slate-800">
                {topVendors.slice(0, 5).map((v) => (
                  <li key={v.name} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                        {v.name}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {v.count} transaksi · {v.withProof}/{v.count} berbukti
                      </p>
                    </div>
                    <span className="shrink-0 font-mono font-semibold text-rose-700 tabular-nums dark:text-rose-400">
                      {formatCurrency(v.total, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* Filters + Ledger Table */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder={
                isIncome
                  ? 'Cari kode, deskripsi, atau ref anonim...'
                  : 'Cari kode, deskripsi, vendor, atau no. bukti...'
              }
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <select
            aria-label="Filter kategori"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          >
            <option value="">Semua Kategori</option>
            {modeCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter akun"
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
        </div>

        {filteredTxs.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed border-slate-200 py-10 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <p>Belum ada catatan {isIncome ? 'pemasukan' : 'pengeluaran'} yang sesuai filter.</p>
            {canCreate && (
              <button
                type="button"
                onClick={() => onOpenNewTx(mode)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#0F1E36] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#162A4A]"
              >
                <Plus className="h-3.5 w-3.5" />
                {isIncome ? 'Catat Pemasukan Baru' : 'Catat Pengeluaran Baru'}
              </button>
            )}
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <tr>
                  <th className="py-2.5 pr-4 font-medium">Tanggal &amp; Kode</th>
                  <th className="py-2.5 pr-4 font-medium">Kategori &amp; Deskripsi</th>
                  <th className="py-2.5 pr-4 font-medium">Akun &amp; Metode</th>
                  <th className="py-2.5 pr-4 font-medium">
                    {isIncome ? 'Ref Anonim' : 'Vendor / No. Bukti'}
                  </th>
                  <th className="py-2.5 pr-4 font-medium">Status</th>
                  <th className="py-2.5 text-right font-medium">Nominal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredTxs.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="py-3 pr-4">
                      <p className="font-mono font-medium text-slate-900 tabular-nums dark:text-slate-100">
                        {tx.date}
                      </p>
                      <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {tx.txCode}
                      </p>
                    </td>
                    <td className="py-3 pr-4">
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {tx.categoryName || 'Tanpa Kategori'}
                      </p>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400">
                        {tx.description}
                      </p>
                    </td>
                    <td className="py-3 pr-4 text-slate-700 dark:text-slate-300">
                      <p>{tx.accountName}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {getPaymentMethodLabelID(tx.paymentMethod)}
                      </p>
                    </td>
                    <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">
                      {isIncome ? (
                        <span className="font-mono text-[11px]">
                          {tx.anonymousRefCode || 'Anonim Umum'}
                        </span>
                      ) : (
                        <div>
                          <p>{tx.counterparty || '—'}</p>
                          {tx.receiptNumber && (
                            <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                              {tx.receiptNumber}
                            </p>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-col items-start gap-1">
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          {getTxStatusLabelID(tx.status)}
                        </span>
                        {canEditDraft && (tx.status === 'draft' || tx.status === 'rejected') && (
                          <button
                            type="button"
                            onClick={() => onEditDraft(tx)}
                            className="text-[11px] font-medium text-violet-700 hover:underline dark:text-violet-400"
                          >
                            Ubah Draf
                          </button>
                        )}
                      </div>
                    </td>
                    <td
                      className={`py-3 text-right font-mono font-semibold tabular-nums ${
                        isIncome
                          ? 'text-teal-700 dark:text-teal-400'
                          : 'text-rose-700 dark:text-rose-400'
                      }`}
                    >
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
