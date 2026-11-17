import React, {useMemo, useState} from 'react';
import {
  ArrowLeftRight,
  Building,
  Edit3,
  Landmark,
  Layers,
  Plus,
  Wallet,
  X,
} from 'lucide-react';
import {
  computeAccountMutationLedger,
  getJakartaDateString,
} from '../../domain/finance';
import {hasFinancePermission} from '../../domain/rbac';
import {
  createFinanceAccount,
  createOrExecuteTransfer,
  updateFinanceAccount,
} from '../../services/financeService';
import type {
  ChurchMembership,
  CurrencyCode,
  FinanceAccount,
  FinanceAccountStatus,
  FinanceAccountType,
  FinancePaymentMethod,
  FinanceSettings,
  FinanceTransaction,
} from '../../types/domain';
import {
  formatCurrency,
  getAccountTypeLabelID,
  getPaymentMethodLabelID,
  getTxStatusLabelID,
} from '../../utils/formatting';
import {extractUserErrorMessage} from '../../utils/firestoreErrors';

interface AccountsBalancesTabProps {
  churchId: string;
  currency: CurrencyCode;
  membership: ChurchMembership;
  accounts: readonly FinanceAccount[];
  transactions: readonly FinanceTransaction[];
  settings: FinanceSettings | null;
  onNotice: (msg: string) => void;
  onError: (msg: string) => void;
}

const ACCOUNT_TYPES: FinanceAccountType[] = [
  'cash',
  'bank',
  'operational',
  'building',
  'other',
];

const PAYMENT_METHODS: FinancePaymentMethod[] = [
  'bank_transfer',
  'cash',
  'qris',
  'debit_card',
  'check',
  'other',
];

function getAccountAccent(type: FinanceAccountType): {
  card: string;
  iconBg: string;
  Icon: React.FC<{className?: string}>;
} {
  switch (type) {
    case 'cash':
      return {
        card: 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/50 dark:bg-emerald-950/20',
        iconBg: 'bg-emerald-700 text-white',
        Icon: Wallet,
      };
    case 'bank':
      return {
        card: 'border-sky-200 bg-sky-50/40 dark:border-sky-900/50 dark:bg-sky-950/20',
        iconBg: 'bg-sky-700 text-white',
        Icon: Landmark,
      };
    case 'operational':
      return {
        card: 'border-violet-200 bg-violet-50/40 dark:border-violet-900/50 dark:bg-violet-950/20',
        iconBg: 'bg-violet-700 text-white',
        Icon: Layers,
      };
    case 'building':
      return {
        card: 'border-amber-200 bg-amber-50/40 dark:border-amber-900/50 dark:bg-amber-950/20',
        iconBg: 'bg-amber-700 text-white',
        Icon: Building,
      };
    default:
      return {
        card: 'border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900',
        iconBg: 'bg-slate-700 text-white',
        Icon: Wallet,
      };
  }
}

export const AccountsBalancesTab: React.FC<AccountsBalancesTabProps> = ({
  churchId,
  currency,
  membership,
  accounts,
  transactions,
  settings,
  onNotice,
  onError,
}) => {
  const canManage = hasFinancePermission(membership, 'finance.manageAccounts');
  const canApprove = hasFinancePermission(membership, 'finance.approve');

  const [selectedAccountId, setSelectedAccountId] = useState<string>(accounts[0]?.id || '');
  const [showArchived, setShowArchived] = useState(false);

  // Account Create/Edit Modal
  const [accountModalMode, setAccountModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingAccount, setEditingAccount] = useState<FinanceAccount | null>(null);
  const [accName, setAccName] = useState('');
  const [accType, setAccType] = useState<FinanceAccountType>('bank');
  const [accOpeningStr, setAccOpeningStr] = useState('0');
  const [accStatus, setAccStatus] = useState<FinanceAccountStatus>('active');
  const [accNotes, setAccNotes] = useState('');
  const [savingAcc, setSavingAcc] = useState(false);

  // Inter-Account Transfer Modal
  const [transferOpen, setTransferOpen] = useState(false);
  const [txDate, setTxDate] = useState(getJakartaDateString());
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [txAmount, setTxAmount] = useState('');
  const [txMethod, setTxMethod] = useState<FinancePaymentMethod>('bank_transfer');
  const [txDesc, setTxDesc] = useState('');
  const [executeNow, setExecuteNow] = useState(true);
  const [savingTransfer, setSavingTransfer] = useState(false);

  const visibleAccounts = useMemo(
    () => accounts.filter((a) => showArchived || a.status !== 'archived'),
    [accounts, showArchived],
  );

  const activeAccounts = useMemo(
    () => accounts.filter((a) => a.status === 'active'),
    [accounts],
  );

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === selectedAccountId) || visibleAccounts[0] || null,
    [accounts, selectedAccountId, visibleAccounts],
  );

  const ledgerEntries = useMemo(
    () => (selectedAccount ? computeAccountMutationLedger(selectedAccount, transactions) : []),
    [selectedAccount, transactions],
  );

  const totalConsolidated = useMemo(
    () => accounts.filter((a) => a.status !== 'archived').reduce((sum, a) => sum + a.currentBalance, 0),
    [accounts],
  );

  // Sparkline points (chronological oldest -> newest)
  const sparklinePoints = useMemo(() => {
    if (!selectedAccount) return [];
    const chrono = [...ledgerEntries].reverse().slice(-14);
    if (chrono.length === 0) return [selectedAccount.openingBalance];
    return [selectedAccount.openingBalance, ...chrono.map((e) => e.runningBalance)];
  }, [selectedAccount, ledgerEntries]);

  const openCreateModal = () => {
    setAccountModalMode('create');
    setEditingAccount(null);
    setAccName('');
    setAccType('bank');
    setAccOpeningStr('0');
    setAccStatus('active');
    setAccNotes('');
  };

  const openEditModal = (acc: FinanceAccount) => {
    setAccountModalMode('edit');
    setEditingAccount(acc);
    setAccName(acc.name);
    setAccType(acc.accountType);
    setAccOpeningStr(String(acc.openingBalance));
    setAccStatus(acc.status);
    setAccNotes(acc.notes || '');
  };

  const openTransferModal = () => {
    setTxDate(getJakartaDateString());
    setFromId(activeAccounts[0]?.id || '');
    setToId(activeAccounts[1]?.id || '');
    setTxAmount('');
    setTxMethod(settings?.defaultPaymentMethod || 'bank_transfer');
    setTxDesc('');
    setExecuteNow(canApprove);
    setTransferOpen(true);
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAcc(true);
    try {
      if (accountModalMode === 'create') {
        const createdId = await createFinanceAccount(churchId, membership, currency, {
          name: accName,
          accountType: accType,
          openingBalance: accOpeningStr,
          notes: accNotes,
        });
        setSelectedAccountId(createdId);
        onNotice(`Akun kas/bank "${accName.trim()}" berhasil dibuat.`);
      } else if (accountModalMode === 'edit' && editingAccount) {
        await updateFinanceAccount(churchId, membership, editingAccount, {
          name: accName,
          accountType: accType,
          status: accStatus,
          notes: accNotes,
        });
        onNotice(`Akun "${accName.trim()}" berhasil diperbarui.`);
      }
      setAccountModalMode(null);
    } catch (err) {
      onError(extractUserErrorMessage(err, 'Gagal menyimpan akun keuangan.'));
    } finally {
      setSavingAcc(false);
    }
  };

  const handleSaveTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const fromAccount = accounts.find((a) => a.id === fromId);
    const toAccount = accounts.find((a) => a.id === toId);
    if (!fromAccount || !toAccount) {
      onError('Pilih akun sumber dan akun tujuan transfer yang valid.');
      return;
    }
    setSavingTransfer(true);
    try {
      await createOrExecuteTransfer(
        churchId,
        membership,
        {
          date: txDate,
          fromAccount,
          toAccount,
          amount: txAmount,
          paymentMethod: txMethod,
          description: txDesc,
          executeImmediately: canApprove && executeNow,
        },
        settings,
      );
      onNotice(
        canApprove && executeNow
          ? `Transfer antar akun ${fromAccount.name} ke ${toAccount.name} berhasil dieksekusi.`
          : `Pengajuan transfer ${fromAccount.name} ke ${toAccount.name} dikirim ke Pusat Persetujuan.`,
      );
      setTransferOpen(false);
    } catch (err) {
      onError(extractUserErrorMessage(err, 'Gagal memproses transfer antar akun.'));
    } finally {
      setSavingTransfer(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Consolidated Strip */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-[#0F1E36] p-6 text-white dark:border dark:border-slate-800 dark:bg-slate-900">
        <div>
          <p className="text-xs text-blue-200/80">
            Saldo Konsolidasi Kas &amp; Rekening · {accounts.filter((a) => a.status !== 'archived').length}{' '}
            akun aktif/non-arsip
          </p>
          <p className="mt-1 font-mono text-3xl font-bold tracking-tight tabular-nums">
            {formatCurrency(totalConsolidated, currency)}
          </p>
          <p className="mt-1 text-[11px] text-blue-200/75">
            Saldo akun hanya berubah melalui persetujuan transaksi, pembatalan (void), atau transfer
            transaksional.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-slate-200">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="rounded border-white/30"
            />
            Tampilkan Diarsipkan
          </label>
          {canManage && activeAccounts.length >= 2 && (
            <button
              type="button"
              onClick={openTransferModal}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-3.5 py-2 text-xs font-medium text-white hover:bg-white/20 whitespace-nowrap"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Transfer Antar Akun
            </button>
          )}
          {canManage && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-teal-500 whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              Tambah Akun Kas/Bank
            </button>
          )}
        </div>
      </section>

      {/* Split Layout: Wallet Cards Grid (Left) + Selected Account Mutation Ledger (Right) */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-5">
          {visibleAccounts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
              Belum ada akun kas atau bank yang terdaftar.
            </div>
          ) : (
            visibleAccounts.map((acc) => {
              const accent = getAccountAccent(acc.accountType);
              const Icon = accent.Icon;
              const isSelected = selectedAccount?.id === acc.id;
              return (
                <div
                  key={acc.id}
                  className={`relative rounded-xl border transition-all ${accent.card} ${
                    isSelected
                      ? 'ring-2 ring-[#0F1E36] dark:ring-violet-400'
                      : 'hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => openEditModal(acc)}
                      aria-label={`Ubah akun ${acc.name}`}
                      className="absolute right-4 top-4 z-10 rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setSelectedAccountId(acc.id)}
                    aria-pressed={isSelected}
                    className="block w-full rounded-xl p-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                  >
                    <div className="flex items-start justify-between gap-3 pr-10">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${accent.iconBg}`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {acc.name}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {getAccountTypeLabelID(acc.accountType)}
                            <span aria-hidden="true"> · </span>
                            {acc.status === 'active'
                              ? 'Aktif'
                              : acc.status === 'inactive'
                                ? 'Nonaktif'
                                : 'Diarsipkan'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-baseline justify-between gap-2 border-t border-slate-200/70 pt-3 dark:border-slate-800">
                      <div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">Saldo Saat Ini</p>
                        <p className="font-mono text-lg font-bold text-slate-900 tabular-nums dark:text-slate-100">
                          {formatCurrency(acc.currentBalance, acc.currency)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">Saldo Awal</p>
                        <p className="font-mono text-xs text-slate-600 tabular-nums dark:text-slate-300">
                          {formatCurrency(acc.openingBalance, acc.currency)}
                        </p>
                      </div>
                    </div>
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Selected Account Mutation Detail */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
          {!selectedAccount ? (
            <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
              Pilih salah satu akun di sisi kiri untuk melihat riwayat mutasi saldo.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
                <div>
                  <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                    Buku Besar Mutasi: {selectedAccount.name}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {getAccountTypeLabelID(selectedAccount.accountType)} · Saldo berjalan dihitung dari
                    saldo awal{' '}
                    <span className="font-mono font-medium">
                      {formatCurrency(selectedAccount.openingBalance, selectedAccount.currency)}
                    </span>
                  </p>
                </div>
                <p className="font-mono text-xl font-bold text-[#0F1E36] tabular-nums dark:text-slate-100">
                  {formatCurrency(selectedAccount.currentBalance, selectedAccount.currency)}
                </p>
              </div>

              {/* Mini SVG Balance Sparkline */}
              {sparklinePoints.length > 1 && (
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                  <p className="mb-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Pergerakan Saldo ({sparklinePoints.length - 1} mutasi terakhir)
                  </p>
                  <svg viewBox="0 0 360 64" className="h-16 w-full" role="img" aria-label="Grafik tren saldo akun">
                    {(() => {
                      const min = Math.min(...sparklinePoints);
                      const max = Math.max(...sparklinePoints);
                      const span = Math.max(1, max - min);
                      const pts = sparklinePoints
                        .map((val, idx) => {
                          const x = (idx / (sparklinePoints.length - 1)) * 344 + 8;
                          const y = 54 - ((val - min) / span) * 44;
                          return `${x.toFixed(1)},${y.toFixed(1)}`;
                        })
                        .join(' ');
                      return (
                        <polyline
                          fill="none"
                          stroke="#0D9488"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          points={pts}
                        />
                      );
                    })()}
                  </svg>
                </div>
              )}

              {/* Ledger Rows */}
              {ledgerEntries.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 py-10 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  Belum ada mutasi transaksi yang disetujui pada akun ini.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                      <tr>
                        <th className="py-2 pr-3 font-medium">Tanggal</th>
                        <th className="py-2 pr-3 font-medium">Kode</th>
                        <th className="py-2 pr-3 font-medium">Keterangan</th>
                        <th className="py-2 pr-3 text-right font-medium">Mutasi</th>
                        <th className="py-2 text-right font-medium">Saldo Akhir</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {ledgerEntries.map((entry) => (
                        <tr key={entry.transactionId}>
                          <td className="py-2.5 pr-3 font-mono text-slate-600 tabular-nums dark:text-slate-300">
                            {entry.date}
                          </td>
                          <td className="py-2.5 pr-3 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            {entry.txCode}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-800 dark:text-slate-200">
                            <p className="line-clamp-1 font-medium">{entry.description}</p>
                            <p className="text-[10px] text-slate-400">
                              {getTxStatusLabelID(entry.status)}
                            </p>
                          </td>
                          <td
                            className={`py-2.5 pr-3 text-right font-mono font-semibold tabular-nums ${
                              entry.delta >= 0
                                ? 'text-teal-700 dark:text-teal-400'
                                : 'text-rose-700 dark:text-rose-400'
                            }`}
                          >
                            {entry.delta >= 0 ? '+' : ''}
                            {formatCurrency(entry.delta, selectedAccount.currency)}
                          </td>
                          <td className="py-2.5 text-right font-mono font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                            {formatCurrency(entry.runningBalance, selectedAccount.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Create / Edit Account Modal */}
      {accountModalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-start justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                {accountModalMode === 'create'
                  ? 'Tambah Akun Kas / Bank Baru'
                  : `Ubah Akun: ${editingAccount?.name}`}
              </h3>
              <button
                type="button"
                onClick={() => setAccountModalMode(null)}
                aria-label="Tutup modal akun"
                className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSaveAccount(e)} className="mt-4 space-y-4 text-xs">
              <div>
                <label htmlFor="acc-name" className="block font-medium text-slate-700 dark:text-slate-300">
                  Nama Akun *
                </label>
                <input
                  id="acc-name"
                  type="text"
                  required
                  value={accName}
                  onChange={(e) => setAccName(e.target.value)}
                  placeholder="Contoh: Bank BCA Operasional Gereja"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="acc-type" className="block font-medium text-slate-700 dark:text-slate-300">
                    Tipe Akun *
                  </label>
                  <select
                    id="acc-type"
                    value={accType}
                    onChange={(e) => setAccType(e.target.value as FinanceAccountType)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {ACCOUNT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {getAccountTypeLabelID(t)}
                      </option>
                    ))}
                  </select>
                </div>

                {accountModalMode === 'create' ? (
                  <div>
                    <label
                      htmlFor="acc-opening"
                      className="block font-medium text-slate-700 dark:text-slate-300"
                    >
                      Saldo Awal ({currency}) *
                    </label>
                    <input
                      id="acc-opening"
                      type="text"
                      inputMode="numeric"
                      required
                      value={accOpeningStr}
                      onChange={(e) => setAccOpeningStr(e.target.value.replace(/[^\d]/g, ''))}
                      className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 tabular-nums dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </div>
                ) : (
                  <div>
                    <label
                      htmlFor="acc-status"
                      className="block font-medium text-slate-700 dark:text-slate-300"
                    >
                      Status Akun
                    </label>
                    <select
                      id="acc-status"
                      value={accStatus}
                      onChange={(e) => setAccStatus(e.target.value as FinanceAccountStatus)}
                      className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    >
                      <option value="active">Aktif</option>
                      <option value="inactive">Nonaktif</option>
                      <option value="archived">Diarsipkan</option>
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="acc-notes" className="block font-medium text-slate-700 dark:text-slate-300">
                  Catatan Akun (Opsional)
                </label>
                <textarea
                  id="acc-notes"
                  rows={2}
                  value={accNotes}
                  onChange={(e) => setAccNotes(e.target.value)}
                  placeholder="Informasi cabang bank atau peruntukan dana"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAccountModalMode(null)}
                  className="rounded-lg border border-slate-200 px-3.5 py-2 font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingAcc}
                  className="rounded-lg bg-[#0F1E36] px-4 py-2 font-medium text-white hover:bg-[#162A4A] disabled:opacity-50"
                >
                  {savingAcc ? 'Menyimpan...' : 'Simpan Akun'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inter-Account Transfer Modal */}
      {transferOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  Transfer Dana Antar Akun
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Pemindahan saldo internal gereja tanpa memengaruhi total pemasukan atau pengeluaran.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTransferOpen(false)}
                aria-label="Tutup modal transfer"
                className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSaveTransfer(e)} className="mt-4 space-y-4 text-xs">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="tr-from" className="block font-medium text-slate-700 dark:text-slate-300">
                    Dari Akun *
                  </label>
                  <select
                    id="tr-from"
                    required
                    value={fromId}
                    onChange={(e) => setFromId(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {activeAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({formatCurrency(a.currentBalance, a.currency)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="tr-to" className="block font-medium text-slate-700 dark:text-slate-300">
                    Ke Akun Tujuan *
                  </label>
                  <select
                    id="tr-to"
                    required
                    value={toId}
                    onChange={(e) => setToId(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {activeAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({formatCurrency(a.currentBalance, a.currency)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="tr-date" className="block font-medium text-slate-700 dark:text-slate-300">
                    Tanggal Transfer *
                  </label>
                  <input
                    id="tr-date"
                    type="date"
                    required
                    value={txDate}
                    onChange={(e) => setTxDate(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label htmlFor="tr-amount" className="block font-medium text-slate-700 dark:text-slate-300">
                    Nominal ({currency}) *
                  </label>
                  <input
                    id="tr-amount"
                    type="text"
                    inputMode="numeric"
                    required
                    value={txAmount}
                    onChange={(e) => setTxAmount(e.target.value.replace(/[^\d]/g, ''))}
                    placeholder="2500000"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 tabular-nums dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="tr-method" className="block font-medium text-slate-700 dark:text-slate-300">
                  Metode Transfer
                </label>
                <select
                  id="tr-method"
                  value={txMethod}
                  onChange={(e) => setTxMethod(e.target.value as FinancePaymentMethod)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {getPaymentMethodLabelID(m)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="tr-desc" className="block font-medium text-slate-700 dark:text-slate-300">
                  Keterangan Transfer *
                </label>
                <input
                  id="tr-desc"
                  type="text"
                  required
                  value={txDesc}
                  onChange={(e) => setTxDesc(e.target.value)}
                  placeholder="Contoh: Setoran tunai kas kecil ke rekening bank utama"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              {canApprove && (
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={executeNow}
                    onChange={(e) => setExecuteNow(e.target.checked)}
                  />
                  <span>Eksekusi &amp; perbarui saldo kedua akun secara atomik sekarang</span>
                </label>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setTransferOpen(false)}
                  className="rounded-lg border border-slate-200 px-3.5 py-2 font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingTransfer}
                  className="rounded-lg bg-[#0F1E36] px-4 py-2 font-medium text-white hover:bg-[#162A4A] disabled:opacity-50"
                >
                  {savingTransfer ? 'Memproses...' : 'Proses Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
