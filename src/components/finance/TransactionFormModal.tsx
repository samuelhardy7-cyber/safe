import React, {useState} from 'react';
import {AlertCircle, Paperclip, ShieldCheck, Upload, X} from 'lucide-react';
import {getJakartaDateString} from '../../domain/finance';
import {hasFinancePermission} from '../../domain/rbac';
import {
  createFinanceTransaction,
  updateDraftFinanceTransaction,
  uploadFinanceReceipt,
} from '../../services/financeService';
import type {
  ChurchMembership,
  CurrencyCode,
  FinanceAccount,
  FinanceCategory,
  FinancePaymentMethod,
  FinanceSettings,
  FinanceTransaction,
} from '../../types/domain';
import {formatCurrency, getPaymentMethodLabelID} from '../../utils/formatting';
import {extractUserErrorMessage} from '../../utils/firestoreErrors';

interface TransactionFormModalProps {
  churchId: string;
  currency: CurrencyCode;
  membership: ChurchMembership;
  mode: 'create' | 'edit';
  initialType: 'income' | 'expense';
  initialTx?: FinanceTransaction | null;
  accounts: readonly FinanceAccount[];
  categories: readonly FinanceCategory[];
  settings: FinanceSettings | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

const PAYMENT_METHODS: FinancePaymentMethod[] = [
  'cash',
  'bank_transfer',
  'qris',
  'debit_card',
  'check',
  'other',
];

export const TransactionFormModal: React.FC<TransactionFormModalProps> = ({
  churchId,
  currency,
  membership,
  mode,
  initialType,
  initialTx,
  accounts,
  categories,
  settings,
  onClose,
  onSaved,
}) => {
  const activeAccounts = accounts.filter((a) => a.status === 'active');
  const [txType, setTxType] = useState<'income' | 'expense'>(
    initialTx && initialTx.type !== 'transfer' ? initialTx.type : initialType,
  );
  const filteredCategories = categories.filter(
    (c) => c.type === txType && c.status === 'active',
  );

  const [date, setDate] = useState(initialTx?.date || getJakartaDateString());
  const [accountId, setAccountId] = useState(
    initialTx?.accountId || activeAccounts[0]?.id || '',
  );
  const [categoryId, setCategoryId] = useState(
    initialTx?.categoryId || filteredCategories[0]?.id || '',
  );
  const [amountStr, setAmountStr] = useState(initialTx ? String(initialTx.amount) : '');
  const [paymentMethod, setPaymentMethod] = useState<FinancePaymentMethod>(
    initialTx?.paymentMethod || settings?.defaultPaymentMethod || 'bank_transfer',
  );
  const [description, setDescription] = useState(initialTx?.description || '');
  const [anonymousRefCode, setAnonymousRefCode] = useState(initialTx?.anonymousRefCode || '');
  const [counterparty, setCounterparty] = useState(initialTx?.counterparty || '');
  const [receiptNumber, setReceiptNumber] = useState(initialTx?.receiptNumber || '');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = hasFinancePermission(membership, 'finance.submit');
  const numericPreview = /^\d+$/.test(amountStr.trim()) ? Number(amountStr.trim()) : 0;

  const handleTypeChange = (next: 'income' | 'expense') => {
    setTxType(next);
    const firstCat = categories.find((c) => c.type === next && c.status === 'active');
    setCategoryId(firstCat?.id || '');
  };

  const handleSave = async (submitImmediately: boolean) => {
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        type: txType,
        date,
        categoryId,
        description,
        amount: amountStr,
        accountId,
        paymentMethod,
        anonymousRefCode: txType === 'income' ? anonymousRefCode : '',
        counterparty: txType === 'expense' ? counterparty : '',
        receiptNumber,
        hasAttachment: Boolean(receiptFile || (initialTx?.attachments?.length ?? 0) > 0),
      };

      if (mode === 'create') {
        const created = await createFinanceTransaction(
          churchId,
          membership,
          payload,
          accounts,
          categories,
          settings,
          submitImmediately,
        );
        if (receiptFile) {
          await uploadFinanceReceipt(churchId, membership, created, receiptFile);
        }
        onSaved(
          submitImmediately
            ? `Transaksi ${created.txCode} berhasil dibuat dan diajukan untuk persetujuan.`
            : `Draf transaksi ${created.txCode} berhasil disimpan.`,
        );
      } else if (initialTx) {
        await updateDraftFinanceTransaction(
          churchId,
          membership,
          initialTx,
          payload,
          accounts,
          categories,
          settings,
        );
        if (receiptFile) {
          await uploadFinanceReceipt(churchId, membership, initialTx, receiptFile);
        }
        onSaved(`Draf transaksi ${initialTx.txCode} berhasil diperbarui.`);
      }
      onClose();
    } catch (err) {
      setError(extractUserErrorMessage(err, 'Gagal menyimpan transaksi keuangan.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tx-modal-title"
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
          <div>
            <h2
              id="tx-modal-title"
              className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100"
            >
              {mode === 'create' ? 'Catat Transaksi Keuangan Baru' : `Ubah Draf ${initialTx?.txCode}`}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Nominal wajib bilangan bulat {currency} · Dilarang memasukkan identitas pribadi jemaat.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup formulir transaksi"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave(false);
          }}
          className="mt-5 space-y-4"
        >
          {/* Segmented Type Selector */}
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => handleTypeChange('income')}
              className={`rounded-md py-2 text-xs font-semibold transition-colors ${
                txType === 'income'
                  ? 'bg-teal-700 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
              }`}
            >
              Pemasukan
            </button>
            <button
              type="button"
              onClick={() => handleTypeChange('expense')}
              className={`rounded-md py-2 text-xs font-semibold transition-colors ${
                txType === 'expense'
                  ? 'bg-rose-700 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
              }`}
            >
              Pengeluaran
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="tx-date" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Tanggal Transaksi *
              </label>
              <input
                id="tx-date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label htmlFor="tx-amount" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Nominal ({currency}, Bilangan Bulat) *
              </label>
              <input
                id="tx-amount"
                type="text"
                inputMode="numeric"
                required
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value.replace(/[^\d]/g, ''))}
                placeholder="500000"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 tabular-nums dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              {numericPreview > 0 && (
                <p className="mt-1 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                  Pratinjau: {formatCurrency(numericPreview, currency)}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="tx-account" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Akun Kas / Bank *
              </label>
              <select
                id="tx-account"
                required
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="">Pilih akun...</option>
                {activeAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({formatCurrency(acc.currentBalance, acc.currency)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="tx-category" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Kategori *
              </label>
              <select
                id="tx-category"
                required
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="">Pilih kategori...</option>
                {filteredCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name} ({cat.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="tx-method" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Metode Pembayaran *
              </label>
              <select
                id="tx-method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as FinancePaymentMethod)}
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
              <label htmlFor="tx-receipt-no" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Nomor Bukti / Kwitansi
              </label>
              <input
                id="tx-receipt-no"
                type="text"
                value={receiptNumber}
                onChange={(e) => setReceiptNumber(e.target.value)}
                placeholder="KW-2026-014"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label htmlFor="tx-description" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Deskripsi Transaksi *
            </label>
            <textarea
              id="tx-description"
              required
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                txType === 'income'
                  ? 'Contoh: Kolekte Ibadah Raya Minggu Pagi'
                  : 'Contoh: Pembayaran tagihan listrik gedung utama bulan April'
              }
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          {txType === 'income' ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-950">
              <label
                htmlFor="tx-anon-ref"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Kode Referensi Donatur Anonim (Opsional)
              </label>
              <input
                id="tx-anon-ref"
                type="text"
                value={anonymousRefCode}
                onChange={(e) => setAnonymousRefCode(e.target.value)}
                placeholder="DNR-004 (hanya kode alfanumerik/tanda hubung)"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-teal-700 dark:text-teal-400" />
                <span>
                  Pemisahan privasi aktif: Jangan isi nama jemaat, nomor HP, atau email. Pemetaan kode
                  hanya tersedia di modul Jemaat khusus Owner.
                </span>
              </p>
            </div>
          ) : (
            <div>
              <label
                htmlFor="tx-counterparty"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Vendor / Toko / Penerima Pembayaran
              </label>
              <input
                id="tx-counterparty"
                type="text"
                value={counterparty}
                onChange={(e) => setCounterparty(e.target.value)}
                placeholder="PLN / PT Telkom / Toko Alat Musik"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          )}

          {/* Private Storage Receipt Upload */}
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3.5 dark:border-slate-700 dark:bg-slate-950">
            <label
              htmlFor="tx-receipt-file"
              className="flex cursor-pointer items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <Upload className="h-4 w-4 text-slate-500" />
                <span>
                  {receiptFile
                    ? `Lampiran dipilih: ${receiptFile.name}`
                    : 'Unggah Bukti / Kwitansi Privat (JPG, PNG, WebP, PDF · Maks 5 MB)'}
                </span>
              </div>
              <span className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                <Paperclip className="h-3 w-3" />
                Pilih File
              </span>
            </label>
            <input
              id="tx-receipt-file"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
              className="sr-only"
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting || activeAccounts.length === 0}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {submitting ? 'Menyimpan...' : 'Simpan Draf'}
            </button>
            {mode === 'create' && canSubmit && (
              <button
                type="button"
                disabled={submitting || activeAccounts.length === 0}
                onClick={() => void handleSave(true)}
                className="rounded-lg bg-[#0F1E36] px-4 py-2 text-xs font-medium text-white hover:bg-[#162A4A] disabled:opacity-50"
              >
                {submitting ? 'Memproses...' : 'Simpan & Ajukan'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
