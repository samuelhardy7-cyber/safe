import React, {useEffect, useMemo, useState} from 'react';
import {
  AlertTriangle,
  Download,
  Eye,
  FileText,
  Paperclip,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {hasFinancePermission} from '../../domain/rbac';
import {
  deleteFinanceReceipt,
  fetchPrivateReceiptBlob,
  uploadFinanceReceipt,
} from '../../services/financeService';
import type {
  ChurchMembership,
  CurrencyCode,
  FinanceAttachment,
  FinanceSettings,
  FinanceTransaction,
} from '../../types/domain';
import {formatCurrency, getTxStatusLabelID} from '../../utils/formatting';
import {extractUserErrorMessage} from '../../utils/firestoreErrors';

interface ReceiptsGalleryTabProps {
  churchId: string;
  currency: CurrencyCode;
  membership: ChurchMembership;
  transactions: readonly FinanceTransaction[];
  settings: FinanceSettings | null;
  onNotice: (msg: string) => void;
  onError: (msg: string) => void;
}

export const ReceiptsGalleryTab: React.FC<ReceiptsGalleryTabProps> = ({
  churchId,
  currency,
  membership,
  transactions,
  settings,
  onNotice,
  onError,
}) => {
  const canViewReceipts = hasFinancePermission(membership, 'finance.viewReceipts');
  const canEditDraft = hasFinancePermission(membership, 'finance.editDraft');
  const canCreate = hasFinancePermission(membership, 'finance.create');
  const threshold = settings?.requireReceiptAboveAmount ?? 0;

  const [filterMode, setFilterMode] = useState<'with_receipt' | 'missing_required'>('with_receipt');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMeta, setPreviewMeta] = useState<{name: string; type: string} | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const txsWithReceipts = useMemo(
    () => transactions.filter((t) => (t.attachments?.length ?? 0) > 0),
    [transactions],
  );

  const missingRequiredTxs = useMemo(() => {
    if (threshold <= 0) return [];
    return transactions.filter(
      (t) =>
        t.status !== 'voided' &&
        t.amount > threshold &&
        (!t.attachments || t.attachments.length === 0) &&
        !(t.receiptNumber || '').trim(),
    );
  }, [transactions, threshold]);

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewMeta(null);
  };

  const handleOpenAttachment = async (tx: FinanceTransaction, att: FinanceAttachment) => {
    if (!canViewReceipts) return;
    setBusyId(att.id);
    try {
      const blob = await fetchPrivateReceiptBlob(churchId, membership, tx, att);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
      setPreviewMeta({name: att.name, type: att.contentType});
    } catch (err) {
      onError(extractUserErrorMessage(err, 'Gagal membuka file bukti dari penyimpanan privat.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleUploadForTx = async (tx: FinanceTransaction, file?: File) => {
    if (!file) return;
    setBusyId(tx.id);
    try {
      await uploadFinanceReceipt(churchId, membership, tx, file);
      onNotice(`Bukti "${file.name}" berhasil diunggah untuk transaksi ${tx.txCode}.`);
    } catch (err) {
      onError(extractUserErrorMessage(err, 'Gagal mengunggah file bukti transaksi.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteAttachment = async (tx: FinanceTransaction, att: FinanceAttachment) => {
    setBusyId(att.id);
    try {
      await deleteFinanceReceipt(churchId, membership, tx, att);
      onNotice(`Lampiran "${att.name}" berhasil dihapus dari draf ${tx.txCode}.`);
    } catch (err) {
      onError(extractUserErrorMessage(err, 'Gagal menghapus lampiran bukti.'));
    } finally {
      setBusyId(null);
    }
  };

  if (!canViewReceipts) {
    return (
      <section className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
        Akses ditolak: Izin <span className="font-mono">finance.viewReceipts</span> diperlukan untuk
        membuka galeri bukti dan kwitansi privat.
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setFilterMode('with_receipt')}
            className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
              filterMode === 'with_receipt'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Memiliki Bukti Digital ({txsWithReceipts.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('missing_required')}
            className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
              filterMode === 'missing_required'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Perlu Bukti Wajib ({missingRequiredTxs.length})
          </button>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Semua lampiran disimpan di Firebase Storage privat dengan URL sementara (ephemeral blob).
        </p>
      </section>

      {filterMode === 'with_receipt' ? (
        txsWithReceipts.length === 0 ? (
          <section className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
            Belum ada transaksi dengan lampiran bukti digital.
          </section>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {txsWithReceipts.map((tx) => (
              <article
                key={tx.id}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      {tx.txCode} · {tx.date}
                    </span>
                    <span className="font-mono text-xs font-bold text-slate-900 tabular-nums dark:text-slate-100">
                      {formatCurrency(tx.amount, currency)}
                    </span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {tx.description}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {tx.accountName} · {getTxStatusLabelID(tx.status)}
                  </p>
                </div>

                <ul className="mt-4 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  {(tx.attachments || []).map((att) => (
                    <li
                      key={att.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-2 text-xs dark:bg-slate-950"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <Paperclip className="h-3.5 w-3.5 shrink-0 text-violet-700 dark:text-violet-400" />
                        <span className="truncate text-slate-700 dark:text-slate-200">{att.name}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          disabled={busyId === att.id}
                          onClick={() => void handleOpenAttachment(tx, att)}
                          aria-label={`Lihat bukti ${att.name}`}
                          className="rounded border border-slate-200 bg-white p-1 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          <Eye className="h-3 w-3" />
                        </button>
                        {canEditDraft && (tx.status === 'draft' || tx.status === 'rejected') && (
                          <button
                            type="button"
                            disabled={busyId === att.id}
                            onClick={() => void handleDeleteAttachment(tx, att)}
                            aria-label={`Hapus bukti ${att.name}`}
                            className="rounded border border-rose-200 bg-white p-1 text-rose-700 hover:bg-rose-50 dark:border-rose-900/60 dark:bg-slate-800 dark:text-rose-300"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          {threshold <= 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Kebijakan ambang batas wajib bukti saat ini bernilai 0 (tidak diwajibkan secara otomatis).
            </p>
          ) : missingRequiredTxs.length === 0 ? (
            <p className="text-xs text-emerald-700 dark:text-emerald-400">
              Seluruh transaksi di atas {formatCurrency(threshold, currency)} telah dilengkapi bukti
              atau nomor kwitansi.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {missingRequiredTxs.map((tx) => {
                const canAttachNow =
                  (canCreate || canEditDraft) &&
                  (tx.status === 'draft' || tx.status === 'submitted' || tx.status === 'rejected');
                return (
                  <li key={tx.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5 text-xs">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-slate-100">
                          {tx.txCode} · {tx.description}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {tx.date} · {formatCurrency(tx.amount, currency)} ·{' '}
                          {getTxStatusLabelID(tx.status)}
                        </p>
                      </div>
                    </div>

                    {canAttachNow && (
                      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#0F1E36] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[#162A4A]">
                        <Upload className="h-3 w-3" />
                        <span>{busyId === tx.id ? 'Mengunggah...' : 'Unggah Bukti'}</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,application/pdf"
                          onChange={(e) => void handleUploadForTx(tx, e.target.files?.[0])}
                          className="sr-only"
                        />
                      </label>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* Ephemeral Preview Modal */}
      {previewUrl && previewMeta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                <FileText className="h-4 w-4 text-violet-700 dark:text-violet-400" />
                <span>{previewMeta.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewUrl}
                  download={previewMeta.name}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                >
                  <Download className="h-3.5 w-3.5" />
                  Unduh Sementara
                </a>
                <button
                  type="button"
                  onClick={closePreview}
                  aria-label="Tutup pratinjau bukti"
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="mt-4 flex-1 overflow-auto rounded-lg bg-slate-100 p-2 dark:bg-slate-950">
              {previewMeta.type === 'application/pdf' ? (
                <iframe
                  src={previewUrl}
                  title={previewMeta.name}
                  className="h-[65vh] w-full rounded border-0"
                />
              ) : (
                <img
                  src={previewUrl}
                  alt={previewMeta.name}
                  className="mx-auto max-h-[65vh] rounded object-contain"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
