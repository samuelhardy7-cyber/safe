import React, {useMemo, useState} from 'react';
import {
  Ban,
  CheckCircle2,
  Eye,
  LayoutList,
  Plus,
  Search,
  Send,
  Table2,
  X,
} from 'lucide-react';
import {
  canEditTransactionDraft,
  canSubmitTransaction,
  canVoidTransaction,
} from '../../domain/finance';
import {hasFinancePermission} from '../../domain/rbac';
import {
  submitFinanceTransaction,
  voidFinanceTransaction,
} from '../../services/financeService';
import type {
  ChurchMembership,
  CurrencyCode,
  FinanceAccount,
  FinanceCategory,
  FinanceSettings,
  FinanceTransaction,
} from '../../types/domain';
import {
  formatCurrency,
  getPaymentMethodLabelID,
  getTxStatusLabelID,
  getTxTypeLabelID,
} from '../../utils/formatting';
import {extractUserErrorMessage} from '../../utils/firestoreErrors';

interface TransactionsWorkbenchTabProps {
  churchId: string;
  currency: CurrencyCode;
  membership: ChurchMembership;
  accounts: readonly FinanceAccount[];
  categories: readonly FinanceCategory[];
  transactions: readonly FinanceTransaction[];
  settings: FinanceSettings | null;
  onOpenNewTx: (type: 'income' | 'expense') => void;
  onEditDraft: (tx: FinanceTransaction) => void;
  onNotice: (msg: string) => void;
  onError: (msg: string) => void;
}

type WorkbenchSubTab = 'all' | 'income' | 'expense' | 'pending' | 'posted' | 'rejected_voided';

export const TransactionsWorkbenchTab: React.FC<TransactionsWorkbenchTabProps> = ({
  churchId,
  currency,
  membership,
  accounts,
  categories,
  transactions,
  settings,
  onOpenNewTx,
  onEditDraft,
  onNotice,
  onError,
}) => {
  const [subTab, setSubTab] = useState<WorkbenchSubTab>('all');
  const [searchText, setSearchText] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'amount_desc'>('date_desc');
  const [viewMode, setViewMode] = useState<'table' | 'compact'>('table');
  const [page, setPage] = useState(1);
  const pageSize = viewMode === 'compact' ? 20 : 12;

  const [detailTx, setDetailTx] = useState<FinanceTransaction | null>(null);
  const [voidTarget, setVoidTarget] = useState<FinanceTransaction | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const canCreate = hasFinancePermission(membership, 'finance.create');

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const list = transactions.filter((tx) => {
      if (subTab === 'income' && tx.type !== 'income') return false;
      if (subTab === 'expense' && tx.type !== 'expense') return false;
      if (subTab === 'pending' && tx.status !== 'draft' && tx.status !== 'submitted') return false;
      if (subTab === 'posted' && tx.status !== 'approved' && tx.status !== 'locked') return false;
      if (subTab === 'rejected_voided' && tx.status !== 'rejected' && tx.status !== 'voided')
        return false;

      if (accountFilter && tx.accountId !== accountFilter && tx.toAccountId !== accountFilter)
        return false;
      if (categoryFilter && tx.categoryId !== categoryFilter) return false;
      if (dateFrom && tx.date < dateFrom) return false;
      if (dateTo && tx.date > dateTo) return false;
      if (!q) return true;

      return (
        tx.txCode.toLowerCase().includes(q) ||
        tx.description.toLowerCase().includes(q) ||
        tx.accountName.toLowerCase().includes(q) ||
        (tx.categoryName || '').toLowerCase().includes(q) ||
        (tx.anonymousRefCode || '').toLowerCase().includes(q) ||
        (tx.counterparty || '').toLowerCase().includes(q) ||
        (tx.receiptNumber || '').toLowerCase().includes(q)
      );
    });

    return list.sort((a, b) => {
      if (sortBy === 'date_asc') return a.date.localeCompare(b.date) || a.txCode.localeCompare(b.txCode);
      if (sortBy === 'amount_desc') return b.amount - a.amount;
      return b.date.localeCompare(a.date) || b.txCode.localeCompare(a.txCode);
    });
  }, [transactions, subTab, searchText, accountFilter, categoryFilter, dateFrom, dateTo, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleSubmitDraft = async (tx: FinanceTransaction) => {
    setBusyId(tx.id);
    try {
      await submitFinanceTransaction(churchId, membership, tx, settings);
      onNotice(`Transaksi ${tx.txCode} berhasil diajukan ke Pusat Persetujuan.`);
    } catch (err) {
      onError(extractUserErrorMessage(err, 'Gagal mengajukan transaksi.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmVoid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidTarget) return;
    setBusyId(voidTarget.id);
    try {
      await voidFinanceTransaction(churchId, membership, voidTarget, voidReason);
      onNotice(`Transaksi ${voidTarget.txCode} telah dibatalkan (void) dan saldo akun disesuaikan.`);
      setVoidTarget(null);
      setVoidReason('');
    } catch (err) {
      onError(extractUserErrorMessage(err, 'Gagal membatalkan transaksi.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Sub-Tabs & Actions Header */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            {(
              [
                ['all', 'Semua'],
                ['income', 'Pemasukan'],
                ['expense', 'Pengeluaran'],
                ['pending', 'Draf / Menunggu'],
                ['posted', 'Disetujui'],
                ['rejected_voided', 'Ditolak / Void'],
              ] as Array<[WorkbenchSubTab, string]>
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setSubTab(id);
                  setPage(1);
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  subTab === id
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
              <button
                type="button"
                aria-label="Tampilan Tabel"
                onClick={() => setViewMode('table')}
                className={`rounded-md p-1.5 ${
                  viewMode === 'table'
                    ? 'bg-[#0F1E36] text-white'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                <Table2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Tampilan Ringkas"
                onClick={() => setViewMode('compact')}
                className={`rounded-md p-1.5 ${
                  viewMode === 'compact'
                    ? 'bg-[#0F1E36] text-white'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                <LayoutList className="h-3.5 w-3.5" />
              </button>
            </div>

            {canCreate && (
              <button
                type="button"
                onClick={() => onOpenNewTx('income')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F1E36] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#162A4A] whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" />
                Transaksi Baru
              </button>
            )}
          </div>
        </div>

        {/* Multi-Filters Row */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                setPage(1);
              }}
              placeholder="Cari kode, deskripsi, ref, vendor..."
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <select
            aria-label="Filter akun transaksi"
            value={accountFilter}
            onChange={(e) => {
              setAccountFilter(e.target.value);
              setPage(1);
            }}
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
            aria-label="Filter kategori transaksi"
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          >
            <option value="">Semua Kategori</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <input
            type="date"
            aria-label="Dari tanggal"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />

          <select
            aria-label="Urutkan transaksi"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'date_desc' | 'date_asc' | 'amount_desc')}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          >
            <option value="date_desc">Tanggal Terbaru</option>
            <option value="date_asc">Tanggal Terlama</option>
            <option value="amount_desc">Nominal Terbesar</option>
          </select>
        </div>
      </section>

      {/* Ledger Table / Compact View / Mobile Cards */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        {pagedRows.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
            Tidak ada transaksi yang cocok dengan kriteria pencarian.
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <tr>
                    <th className="py-2.5 pr-3 font-medium">Tanggal</th>
                    <th className="py-2.5 pr-3 font-medium">Kode</th>
                    <th className="py-2.5 pr-3 font-medium">Jenis &amp; Kategori</th>
                    <th className="py-2.5 pr-3 font-medium">Deskripsi</th>
                    <th className="py-2.5 pr-3 font-medium">Akun</th>
                    <th className="py-2.5 pr-3 font-medium">Status</th>
                    <th className="py-2.5 pr-3 text-right font-medium">Nominal</th>
                    <th className="py-2.5 text-right font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {pagedRows.map((tx) => {
                    const editable = canEditTransactionDraft(membership, tx);
                    const submittable = canSubmitTransaction(membership, tx);
                    const voidable = canVoidTransaction(membership, tx);
                    const rowPad = viewMode === 'compact' ? 'py-2' : 'py-3';
                    return (
                      <tr key={tx.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className={`${rowPad} pr-3 font-mono text-slate-700 tabular-nums dark:text-slate-300`}>
                          {tx.date}
                        </td>
                        <td className={`${rowPad} pr-3 font-mono text-[11px] text-slate-500 dark:text-slate-400`}>
                          {tx.txCode}
                        </td>
                        <td className={`${rowPad} pr-3`}>
                          <span className="font-medium text-slate-900 dark:text-slate-100">
                            {getTxTypeLabelID(tx.type)}
                          </span>
                          {tx.categoryName && (
                            <span className="text-slate-500 dark:text-slate-400">
                              {' '}
                              · {tx.categoryName}
                            </span>
                          )}
                        </td>
                        <td className={`${rowPad} max-w-[240px] truncate pr-3 text-slate-800 dark:text-slate-200`}>
                          {tx.description}
                        </td>
                        <td className={`${rowPad} pr-3 text-slate-600 dark:text-slate-300`}>
                          {tx.toAccountName ? `${tx.accountName} -> ${tx.toAccountName}` : tx.accountName}
                        </td>
                        <td className={`${rowPad} pr-3 font-medium text-slate-700 dark:text-slate-200`}>
                          {getTxStatusLabelID(tx.status)}
                        </td>
                        <td
                          className={`${rowPad} pr-3 text-right font-mono font-semibold tabular-nums ${
                            tx.type === 'income'
                              ? 'text-teal-700 dark:text-teal-400'
                              : tx.type === 'expense'
                                ? 'text-rose-700 dark:text-rose-400'
                                : 'text-slate-800 dark:text-slate-200'
                          }`}
                        >
                          {formatCurrency(tx.amount, currency)}
                        </td>
                        <td className={`${rowPad} text-right`}>
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setDetailTx(tx)}
                              aria-label={`Detail ${tx.txCode}`}
                              className="rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                            >
                              <Eye className="h-3 w-3" />
                            </button>
                            {editable && (
                              <button
                                type="button"
                                onClick={() => onEditDraft(tx)}
                                className="rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                              >
                                Ubah
                              </button>
                            )}
                            {submittable && (
                              <button
                                type="button"
                                disabled={busyId === tx.id}
                                onClick={() => void handleSubmitDraft(tx)}
                                className="inline-flex items-center gap-1 rounded bg-[#0F1E36] px-2 py-1 text-[11px] font-medium text-white hover:bg-[#162A4A] disabled:opacity-50"
                              >
                                <Send className="h-3 w-3" />
                                Ajukan
                              </button>
                            )}
                            {voidable && (
                              <button
                                type="button"
                                onClick={() => setVoidTarget(tx)}
                                className="inline-flex items-center gap-1 rounded border border-rose-200 px-2 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-300"
                              >
                                <Ban className="h-3 w-3" />
                                Void
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card Reflow */}
            <ul className="divide-y divide-slate-100 md:hidden dark:divide-slate-800">
              {pagedRows.map((tx) => (
                <li key={tx.id} className="space-y-2 py-3.5 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">
                        {tx.description}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {tx.txCode} · {tx.date} · {getTxStatusLabelID(tx.status)}
                      </p>
                    </div>
                    <p
                      className={`font-mono font-semibold tabular-nums ${
                        tx.type === 'income'
                          ? 'text-teal-700 dark:text-teal-400'
                          : 'text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      {formatCurrency(tx.amount, currency)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setDetailTx(tx)}
                      className="rounded border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
                    >
                      Detail
                    </button>
                    {canSubmitTransaction(membership, tx) && (
                      <button
                        type="button"
                        disabled={busyId === tx.id}
                        onClick={() => void handleSubmitDraft(tx)}
                        className="rounded bg-[#0F1E36] px-2.5 py-1 text-[11px] font-medium text-white"
                      >
                        Ajukan
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {/* Pagination */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <span className="tabular-nums">
                Menampilkan {pagedRows.length} dari {filtered.length} transaksi (Halaman {safePage}/
                {totalPages})
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200"
                >
                  Sebelumnya
                </button>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200"
                >
                  Berikutnya
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {/* Detail Modal */}
      {detailTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  Detail Transaksi {detailTx.txCode}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {getTxTypeLabelID(detailTx.type)} · {getTxStatusLabelID(detailTx.status)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailTx(null)}
                aria-label="Tutup detail transaksi"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <dl className="mt-4 divide-y divide-slate-100 text-xs dark:divide-slate-800">
              <div className="flex justify-between py-2">
                <dt className="text-slate-500">Tanggal</dt>
                <dd className="font-mono font-medium text-slate-900 dark:text-slate-100">{detailTx.date}</dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-slate-500">Nominal</dt>
                <dd className="font-mono font-bold text-slate-900 dark:text-slate-100">
                  {formatCurrency(detailTx.amount, currency)}
                </dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-slate-500">Akun</dt>
                <dd className="text-slate-900 dark:text-slate-100">
                  {detailTx.toAccountName
                    ? `${detailTx.accountName} -> ${detailTx.toAccountName}`
                    : detailTx.accountName}
                </dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-slate-500">Metode Pembayaran</dt>
                <dd className="text-slate-900 dark:text-slate-100">
                  {getPaymentMethodLabelID(detailTx.paymentMethod)}
                </dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-slate-500">Dibuat Oleh</dt>
                <dd className="text-slate-900 dark:text-slate-100">{detailTx.createdByEmail}</dd>
              </div>
              {detailTx.approvedByEmail && (
                <div className="flex justify-between py-2">
                  <dt className="text-slate-500">Disetujui Oleh</dt>
                  <dd className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {detailTx.approvedByEmail}
                  </dd>
                </div>
              )}
              {detailTx.rejectionReason && (
                <div className="py-2">
                  <dt className="text-rose-700 dark:text-rose-400">Alasan Penolakan</dt>
                  <dd className="mt-1 text-slate-800 dark:text-slate-200">{detailTx.rejectionReason}</dd>
                </div>
              )}
              {detailTx.voidReason && (
                <div className="py-2">
                  <dt className="text-rose-700 dark:text-rose-400">Alasan Void</dt>
                  <dd className="mt-1 text-slate-800 dark:text-slate-200">{detailTx.voidReason}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      )}

      {/* Void Confirmation Modal */}
      {voidTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-xl border border-rose-200 bg-white p-6 shadow-xl dark:border-rose-900/60 dark:bg-slate-900"
          >
            <h3 className="font-display text-base font-semibold text-rose-800 dark:text-rose-300">
              Konfirmasi Pembatalan (Void) — {voidTarget.txCode}
            </h3>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Pembatalan ini akan membalikkan dampak saldo sebesar{' '}
              <strong className="font-mono">{formatCurrency(voidTarget.amount, currency)}</strong> secara
              transaksional dan mencatatnya permanen di Audit Log.
            </p>
            <form onSubmit={(e) => void handleConfirmVoid(e)} className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="void-reason"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Alasan Pembatalan (Wajib) *
                </label>
                <textarea
                  id="void-reason"
                  required
                  minLength={3}
                  rows={2}
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="Contoh: Kesalahan pencatatan ganda atau pembatalan transfer bank"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setVoidTarget(null);
                    setVoidReason('');
                  }}
                  className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={busyId === voidTarget.id}
                  className="rounded-lg bg-rose-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-rose-600 disabled:opacity-50"
                >
                  {busyId === voidTarget.id ? 'Memproses Void...' : 'Konfirmasi Void'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
