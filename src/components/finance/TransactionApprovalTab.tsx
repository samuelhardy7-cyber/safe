import React, {useEffect, useMemo, useState} from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileText,
  Lock,
  ShieldAlert,
  X,
  XCircle,
} from 'lucide-react';
import {
  canApproveTransaction,
  canRejectTransaction,
  canVoidTransaction,
} from '../../domain/finance';
import {hasFinancePermission} from '../../domain/rbac';
import {
  approveFinanceTransaction,
  fetchPrivateReceiptBlob,
  rejectFinanceTransaction,
  voidFinanceTransaction,
} from '../../services/financeService';
import type {
  ChurchMembership,
  CurrencyCode,
  FinanceAttachment,
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

interface TransactionApprovalTabProps {
  churchId: string;
  currency: CurrencyCode;
  membership: ChurchMembership;
  transactions: readonly FinanceTransaction[];
  settings: FinanceSettings | null;
  onNotice: (msg: string) => void;
  onError: (msg: string) => void;
}

export const TransactionApprovalTab: React.FC<TransactionApprovalTabProps> = ({
  churchId,
  currency,
  membership,
  transactions,
  settings,
  onNotice,
  onError,
}) => {
  const [queueFilter, setQueueFilter] = useState<'submitted' | 'approved_history'>('submitted');
  const [selectedId, setSelectedId] = useState<string>('');
  const [overrideReason, setOverrideReason] = useState('');
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [confirmApproveOpen, setConfirmApproveOpen] = useState(false);
  const [voidMode, setVoidMode] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [busy, setBusy] = useState(false);

  // Ephemeral Private Receipt Preview
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState('');
  const [previewType, setPreviewType] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);

  const canViewReceipts = hasFinancePermission(membership, 'finance.viewReceipts');

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const queueItems = useMemo(() => {
    if (queueFilter === 'submitted') {
      return transactions.filter((t) => t.status === 'submitted');
    }
    return transactions
      .filter((t) => t.status === 'approved' || t.status === 'locked')
      .slice(0, 40);
  }, [transactions, queueFilter]);

  const selectedTx = useMemo(
    () => queueItems.find((t) => t.id === selectedId) || queueItems[0] || null,
    [queueItems, selectedId],
  );

  const approvalCheck = selectedTx
    ? canApproveTransaction(membership, selectedTx, settings)
    : {allowed: false, requiresOwnerOverride: false};
  const rejectAllowed = selectedTx ? canRejectTransaction(membership, selectedTx) : false;
  const voidAllowed = selectedTx ? canVoidTransaction(membership, selectedTx) : false;

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewName('');
    setPreviewType('');
  };

  const handleOpenReceipt = async (tx: FinanceTransaction, att: FinanceAttachment) => {
    if (!canViewReceipts) return;
    setLoadingPreview(true);
    try {
      const blob = await fetchPrivateReceiptBlob(churchId, membership, tx, att);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
      setPreviewName(att.name);
      setPreviewType(att.contentType);
    } catch (err) {
      onError(extractUserErrorMessage(err, 'Gagal mengunduh lampiran bukti privat.'));
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedTx) return;
    setBusy(true);
    try {
      await approveFinanceTransaction(
        churchId,
        membership,
        selectedTx,
        settings,
        approvalCheck.requiresOwnerOverride ? overrideReason : undefined,
      );
      onNotice(
        `Transaksi ${selectedTx.txCode} disetujui dan saldo akun kas diperbarui secara transaksional.`,
      );
      setOverrideReason('');
      setRejectMode(false);
      setConfirmApproveOpen(false);
    } catch (err) {
      onError(extractUserErrorMessage(err, 'Gagal menyetujui transaksi.'));
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTx) return;
    setBusy(true);
    try {
      await rejectFinanceTransaction(churchId, membership, selectedTx, rejectReason);
      onNotice(`Transaksi ${selectedTx.txCode} ditolak dan dikembalikan ke pembuat draf.`);
      setRejectMode(false);
      setRejectReason('');
    } catch (err) {
      onError(extractUserErrorMessage(err, 'Gagal menolak transaksi.'));
    } finally {
      setBusy(false);
    }
  };

  const handleVoid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTx) return;
    setBusy(true);
    try {
      await voidFinanceTransaction(churchId, membership, selectedTx, voidReason);
      onNotice(`Transaksi ${selectedTx.txCode} dibatalkan (void) dan dampak saldo dibalikkan.`);
      setVoidMode(false);
      setVoidReason('');
    } catch (err) {
      onError(extractUserErrorMessage(err, 'Gagal melakukan void transaksi.'));
    } finally {
      setBusy(false);
    }
  };

  const submittedCount = transactions.filter((t) => t.status === 'submitted').length;

  return (
    <div className="space-y-5">
      {/* Queue Filter Header */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3.5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => {
              setQueueFilter('submitted');
              setRejectMode(false);
              setVoidMode(false);
            }}
            className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
              queueFilter === 'submitted'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Menunggu Persetujuan ({submittedCount})
          </button>
          <button
            type="button"
            onClick={() => {
              setQueueFilter('approved_history');
              setRejectMode(false);
              setVoidMode(false);
            }}
            className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
              queueFilter === 'approved_history'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Sudah Disetujui / Terkunci
          </button>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Pemisahan tugas aktif: Pembuat non-Owner tidak dapat menyetujui transaksinya sendiri.
        </p>
      </section>

      {/* Split Workspace: Left Queue + Right Detailed Inspector */}
      <div className="grid gap-6 lg:grid-cols-12">
        <aside className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
          {queueItems.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
              {queueFilter === 'submitted'
                ? 'Tidak ada transaksi yang menunggu persetujuan saat ini.'
                : 'Belum ada transaksi yang telah disetujui.'}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {queueItems.map((tx) => {
                const isSelected = selectedTx?.id === tx.id;
                return (
                  <li key={tx.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(tx.id);
                        setRejectMode(false);
                        setVoidMode(false);
                        setOverrideReason('');
                      }}
                      className={`w-full rounded-lg p-3.5 text-left transition-colors ${
                        isSelected
                          ? 'bg-slate-100 ring-1 ring-[#0F1E36] dark:bg-slate-800 dark:ring-violet-400'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                            {tx.description}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            <span className="font-mono">{tx.txCode}</span>
                            <span aria-hidden="true"> · </span>
                            <span>{tx.date}</span>
                            <span aria-hidden="true"> · </span>
                            <span>{getTxTypeLabelID(tx.type)}</span>
                          </p>
                        </div>
                        <p
                          className={`shrink-0 font-mono text-xs font-bold tabular-nums ${
                            tx.type === 'income'
                              ? 'text-teal-700 dark:text-teal-400'
                              : tx.type === 'expense'
                                ? 'text-rose-700 dark:text-rose-400'
                                : 'text-slate-800 dark:text-slate-200'
                          }`}
                        >
                          {formatCurrency(tx.amount, currency)}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* Detailed Inspector */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
          {!selectedTx ? (
            <div className="py-16 text-center text-xs text-slate-500 dark:text-slate-400">
              Pilih transaksi di antrian kiri untuk meninjau rincian dan bukti lampiran.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
                <div>
                  <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                    {selectedTx.txCode} · {getTxStatusLabelID(selectedTx.status)}
                  </p>
                  <h2 className="mt-1 font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {selectedTx.description}
                  </h2>
                </div>
                <p
                  className={`font-mono text-2xl font-bold tabular-nums ${
                    selectedTx.type === 'income'
                      ? 'text-teal-700 dark:text-teal-400'
                      : selectedTx.type === 'expense'
                        ? 'text-rose-700 dark:text-rose-400'
                        : 'text-slate-900 dark:text-slate-100'
                  }`}
                >
                  {formatCurrency(selectedTx.amount, currency)}
                </p>
              </div>

              <dl className="grid gap-3 rounded-lg border border-slate-100 bg-slate-50 p-4 text-xs sm:grid-cols-2 dark:border-slate-800 dark:bg-slate-950">
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Tanggal Transaksi</dt>
                  <dd className="mt-0.5 font-mono font-medium text-slate-900 dark:text-slate-100">
                    {selectedTx.date}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Akun Kas / Bank</dt>
                  <dd className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                    {selectedTx.toAccountName
                      ? `${selectedTx.accountName} -> ${selectedTx.toAccountName}`
                      : selectedTx.accountName}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Kategori</dt>
                  <dd className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                    {selectedTx.categoryName || (selectedTx.type === 'transfer' ? 'Transfer Internal' : '—')}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Metode &amp; No. Bukti</dt>
                  <dd className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                    {getPaymentMethodLabelID(selectedTx.paymentMethod)} ·{' '}
                    {selectedTx.receiptNumber || 'Tanpa nomor kwitansi'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Pembuat Pencatatan</dt>
                  <dd className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                    {selectedTx.createdByEmail}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">
                    {selectedTx.type === 'income' ? 'Kode Ref Anonim' : 'Vendor / Pihak Terkait'}
                  </dt>
                  <dd className="mt-0.5 font-mono font-medium text-slate-900 dark:text-slate-100">
                    {selectedTx.anonymousRefCode || selectedTx.counterparty || '—'}
                  </dd>
                </div>
              </dl>

              {/* Private Attachments Inspection */}
              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Lampiran Bukti &amp; Kwitansi ({selectedTx.attachments?.length || 0})
                </p>
                {!canViewReceipts ? (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <Lock className="h-3.5 w-3.5" />
                    Izin <span className="font-mono">finance.viewReceipts</span> diperlukan untuk
                    membuka file lampiran privat.
                  </p>
                ) : !selectedTx.attachments || selectedTx.attachments.length === 0 ? (
                  <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                    Tidak ada file lampiran digital pada transaksi ini.
                  </p>
                ) : (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {selectedTx.attachments.map((att) => (
                      <button
                        key={att.id}
                        type="button"
                        disabled={loadingPreview}
                        onClick={() => void handleOpenReceipt(selectedTx, att)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      >
                        <Eye className="h-3.5 w-3.5 text-violet-700 dark:text-violet-400" />
                        <span>{att.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Segregation of Duties Alert & Actions */}
              {selectedTx.status === 'submitted' && (
                <div className="space-y-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                  {!approvalCheck.allowed && approvalCheck.reason && (
                    <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-950 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-200">
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
                      <span>{approvalCheck.reason}</span>
                    </div>
                  )}

                  {approvalCheck.allowed && approvalCheck.requiresOwnerOverride && (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-xs dark:border-amber-800/70 dark:bg-amber-950/30">
                      <div className="flex items-center gap-2 font-semibold text-amber-950 dark:text-amber-200">
                        <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                        <span>Override Owner untuk Transaksi Buatan Sendiri</span>
                      </div>
                      <p className="mt-1 text-amber-900/90 dark:text-amber-300/90">
                        Karena transaksi ini dibuat oleh akun Owner Anda sendiri, masukkan alasan
                        override (minimal 5 karakter) yang akan dicatat permanen di Audit Log.
                      </p>
                      <input
                        type="text"
                        value={overrideReason}
                        onChange={(e) => setOverrideReason(e.target.value)}
                        placeholder="Alasan override persetujuan Owner (wajib)"
                        className="mt-2.5 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-amber-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                    </div>
                  )}

                  {rejectMode ? (
                    <form
                      onSubmit={(e) => void handleReject(e)}
                      className="rounded-lg border border-rose-200 bg-rose-50/70 p-4 text-xs dark:border-rose-900/60 dark:bg-rose-950/30"
                    >
                      <label
                        htmlFor="reject-reason"
                        className="block font-semibold text-rose-900 dark:text-rose-200"
                      >
                        Alasan Penolakan Transaksi *
                      </label>
                      <textarea
                        id="reject-reason"
                        required
                        minLength={3}
                        rows={2}
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Contoh: Nominal tidak sesuai dengan foto struk pembelian"
                        className="mt-1.5 w-full rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-rose-800 dark:bg-slate-900 dark:text-slate-100"
                      />
                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setRejectMode(false)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          Batal
                        </button>
                        <button
                          type="submit"
                          disabled={busy}
                          className="rounded-lg bg-rose-700 px-3.5 py-1.5 font-medium text-white hover:bg-rose-600 disabled:opacity-50"
                        >
                          {busy ? 'Menolak...' : 'Konfirmasi Tolak'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-6 pt-1">
                      {rejectAllowed ? (
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmApproveOpen(false);
                            setRejectMode(true);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-4 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:bg-slate-900 dark:text-rose-300"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Tolak Transaksi
                        </button>
                      ) : (
                        <span />
                      )}

                      {approvalCheck.allowed && (
                        <button
                          type="button"
                          disabled={
                            busy ||
                            (approvalCheck.requiresOwnerOverride &&
                              overrideReason.trim().length < 5)
                          }
                          onClick={() => setConfirmApproveOpen(true)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-5 py-2 text-xs font-semibold text-white hover:bg-teal-600 disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          {busy ? 'Menyetujui...' : 'Setujui & Perbarui Saldo'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Void Option for Approved/Locked History */}
              {(selectedTx.status === 'approved' || selectedTx.status === 'locked') &&
                voidAllowed && (
                  <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
                    {voidMode ? (
                      <form
                        onSubmit={(e) => void handleVoid(e)}
                        className="rounded-lg border border-rose-200 bg-rose-50/70 p-4 text-xs dark:border-rose-900/60 dark:bg-rose-950/30"
                      >
                        <label
                          htmlFor="approval-void-reason"
                          className="block font-semibold text-rose-900 dark:text-rose-200"
                        >
                          Alasan Pembatalan (Void) &amp; Pembalikan Saldo *
                        </label>
                        <textarea
                          id="approval-void-reason"
                          required
                          minLength={3}
                          rows={2}
                          value={voidReason}
                          onChange={(e) => setVoidReason(e.target.value)}
                          className="mt-1.5 w-full rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-rose-800 dark:bg-slate-900 dark:text-slate-100"
                        />
                        <div className="mt-3 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setVoidMode(false)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                          >
                            Batal
                          </button>
                          <button
                            type="submit"
                            disabled={busy}
                            className="rounded-lg bg-rose-700 px-3.5 py-1.5 font-medium text-white hover:bg-rose-600"
                          >
                            {busy ? 'Memproses...' : 'Konfirmasi Void'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setVoidMode(true)}
                        className="rounded-lg border border-rose-200 px-3.5 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-300"
                      >
                        Batalkan (Void) Transaksi Disetujui
                      </button>
                    )}
                  </div>
                )}
            </div>
          )}
        </section>
      </div>

      {/* Ephemeral Private Receipt Preview Modal */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                <FileText className="h-4 w-4 text-violet-700 dark:text-violet-400" />
                <span>{previewName}</span>
              </div>
              <button
                type="button"
                onClick={closePreview}
                aria-label="Tutup pratinjau bukti"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex-1 overflow-auto rounded-lg bg-slate-100 p-2 dark:bg-slate-950">
              {previewType === 'application/pdf' ? (
                <iframe
                  src={previewUrl}
                  title={previewName}
                  className="h-[65vh] w-full rounded border-0"
                />
              ) : (
                <img
                  src={previewUrl}
                  alt={previewName}
                  className="mx-auto max-h-[65vh] rounded object-contain"
                />
              )}
            </div>
          </div>
        </div>
      )}
      {/* Approval Confirmation Modal */}
      {confirmApproveOpen && selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-approve-title"
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <h3
              id="confirm-approve-title"
              className="font-display text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              Konfirmasi Persetujuan Transaksi
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Tindakan ini akan mengubah status menjadi disetujui/terkunci dan memperbarui saldo
              akun kas secara transaksional.
            </p>

            <dl className="mt-4 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs dark:border-slate-800 dark:bg-slate-950">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500 dark:text-slate-400">Kode &amp; Jenis</dt>
                <dd className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                  {selectedTx.txCode} · {getTxTypeLabelID(selectedTx.type)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500 dark:text-slate-400">Nominal</dt>
                <dd className="font-mono font-bold text-teal-700 tabular-nums dark:text-teal-400">
                  {formatCurrency(selectedTx.amount, currency)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500 dark:text-slate-400">Akun</dt>
                <dd className="font-medium text-slate-900 dark:text-slate-100">
                  {selectedTx.toAccountName
                    ? `${selectedTx.accountName} -> ${selectedTx.toAccountName}`
                    : selectedTx.accountName}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500 dark:text-slate-400">Deskripsi</dt>
                <dd className="max-w-[220px] truncate text-right text-slate-800 dark:text-slate-200">
                  {selectedTx.description}
                </dd>
              </div>
              {approvalCheck.requiresOwnerOverride && (
                <div className="border-t border-slate-200 pt-2 dark:border-slate-800">
                  <dt className="text-amber-700 dark:text-amber-400">Alasan Override Owner</dt>
                  <dd className="mt-0.5 text-slate-800 dark:text-slate-200">{overrideReason}</dd>
                </div>
              )}
            </dl>

            <div className="mt-5 flex items-center justify-between gap-4">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmApproveOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleApprove()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-600 disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {busy ? 'Menyetujui...' : 'Ya, Setujui & Perbarui Saldo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
