import React, {useEffect, useState} from 'react';
import {Lock, Save, ShieldCheck} from 'lucide-react';
import {hasFinancePermission} from '../../domain/rbac';
import {upsertFinanceSettings} from '../../services/financeService';
import type {
  ChurchMembership,
  CurrencyCode,
  FinancePaymentMethod,
  FinanceSettings,
} from '../../types/domain';
import {formatCurrency, getPaymentMethodLabelID} from '../../utils/formatting';
import {extractUserErrorMessage} from '../../utils/firestoreErrors';

interface FinancialSettingsTabProps {
  churchId: string;
  currency: CurrencyCode;
  membership: ChurchMembership;
  settings: FinanceSettings | null;
  onNotice: (msg: string) => void;
  onError: (msg: string) => void;
}

const PAYMENT_METHODS: FinancePaymentMethod[] = [
  'bank_transfer',
  'cash',
  'qris',
  'debit_card',
  'check',
  'other',
];

export const FinancialSettingsTab: React.FC<FinancialSettingsTabProps> = ({
  churchId,
  currency,
  membership,
  settings,
  onNotice,
  onError,
}) => {
  const canManage = hasFinancePermission(membership, 'finance.manageSettings');

  const [thresholdStr, setThresholdStr] = useState(
    String(settings?.requireReceiptAboveAmount ?? 500000),
  );
  const [allowOwnerOverride, setAllowOwnerOverride] = useState(
    settings?.allowOwnerSelfApproveOverride ?? true,
  );
  const [autoLock, setAutoLock] = useState(settings?.autoLockOnApproval ?? true);
  const [defaultMethod, setDefaultMethod] = useState<FinancePaymentMethod>(
    settings?.defaultPaymentMethod || 'bank_transfer',
  );
  const [fiscalLockDate, setFiscalLockDate] = useState(settings?.fiscalLockBeforeDate || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setThresholdStr(String(settings.requireReceiptAboveAmount));
    setAllowOwnerOverride(settings.allowOwnerSelfApproveOverride);
    setAutoLock(settings.autoLockOnApproval);
    setDefaultMethod(settings.defaultPaymentMethod);
    setFiscalLockDate(settings.fiscalLockBeforeDate || '');
  }, [settings]);

  if (!canManage) {
    return (
      <section className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
        <div className="flex items-center gap-2 font-semibold">
          <Lock className="h-4 w-4" />
          <span>Akses Pengaturan Diblokir</span>
        </div>
        <p className="mt-1">
          Diperlukan izin <span className="font-mono">finance.manageSettings</span> untuk mengubah
          kebijakan kontrol keuangan gereja.
        </p>
      </section>
    );
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await upsertFinanceSettings(churchId, membership, {
        requireReceiptAboveAmount: thresholdStr,
        allowOwnerSelfApproveOverride: allowOwnerOverride,
        autoLockOnApproval: autoLock,
        defaultPaymentMethod: defaultMethod,
        fiscalLockBeforeDate: fiscalLockDate,
      });
      onNotice('Pengaturan kontrol keuangan gereja berhasil disimpan dan dicatat di Audit Log.');
    } catch (err) {
      onError(extractUserErrorMessage(err, 'Gagal menyimpan pengaturan keuangan.'));
    } finally {
      setSaving(false);
    }
  };

  const previewThreshold = /^\d+$/.test(thresholdStr) ? Number(thresholdStr) : 0;

  return (
    <form
      onSubmit={(e) => void handleSave(e)}
      className="mx-auto max-w-3xl space-y-6 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="border-b border-slate-100 pb-4 dark:border-slate-800">
        <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
          Kebijakan Kontrol &amp; Tata Kelola Keuangan
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Atur ambang wajib kwitansi, penguncian otomatis setelah persetujuan, dan batas tutup
          buku fiskal gereja.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label
            htmlFor="fin-set-threshold"
            className="block text-xs font-medium text-slate-700 dark:text-slate-300"
          >
            Wajib Bukti / Kwitansi di Atas ({currency})
          </label>
          <input
            id="fin-set-threshold"
            type="text"
            inputMode="numeric"
            value={thresholdStr}
            onChange={(e) => setThresholdStr(e.target.value.replace(/[^\d]/g, ''))}
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 tabular-nums dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Nilai saat ini: <span className="font-mono">{formatCurrency(previewThreshold, currency)}</span>{' '}
            (isi 0 untuk menonaktifkan).
          </p>
        </div>

        <div>
          <label
            htmlFor="fin-set-method"
            className="block text-xs font-medium text-slate-700 dark:text-slate-300"
          >
            Metode Pembayaran Default
          </label>
          <select
            id="fin-set-method"
            value={defaultMethod}
            onChange={(e) => setDefaultMethod(e.target.value as FinancePaymentMethod)}
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
          <label
            htmlFor="fin-set-lockdate"
            className="block text-xs font-medium text-slate-700 dark:text-slate-300"
          >
            Kunci Periode Sebelum Tanggal (Tutup Buku Fiskal)
          </label>
          <input
            id="fin-set-lockdate"
            type="date"
            value={fiscalLockDate}
            onChange={(e) => setFiscalLockDate(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Transaksi bertanggal sebelum tanggal ini akan ditolak oleh validasi.
          </p>
        </div>
      </div>

      <div className="space-y-3 border-t border-slate-100 pt-4 text-xs dark:border-slate-800">
        <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3.5 dark:border-slate-800">
          <input
            type="checkbox"
            checked={autoLock}
            onChange={(e) => setAutoLock(e.target.checked)}
            className="mt-0.5"
          />
          <div>
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              Kunci Transaksi Secara Otomatis Setelah Disetujui (Immutable Lock)
            </span>
            <p className="mt-0.5 text-slate-500 dark:text-slate-400">
              Direkomendasikan aktif: transaksi yang sudah disetujui langsung berstatus Terkunci dan
              hanya bisa dikoreksi melalui Void berizin.
            </p>
          </div>
        </label>

        <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3.5 dark:border-slate-800">
          <input
            type="checkbox"
            checked={allowOwnerOverride}
            onChange={(e) => setAllowOwnerOverride(e.target.checked)}
            className="mt-0.5"
          />
          <div>
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              Izinkan Owner Menyetujui Transaksi Buatan Sendiri dengan Alasan Override
            </span>
            <p className="mt-0.5 text-slate-500 dark:text-slate-400">
              Pengguna non-Owner tetap dilarang keras menyetujui transaksinya sendiri sesuai prinsip
              Pemisahan Tugas.
            </p>
          </div>
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
        <p className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          <ShieldCheck className="h-4 w-4 text-teal-700 dark:text-teal-400" />
          <span>Perubahan kebijakan diaudit otomatis di Firestore &amp; Finance Audit Log.</span>
        </p>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F1E36] px-4 py-2 text-xs font-medium text-white hover:bg-[#162A4A] disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? 'Menyimpan...' : 'Simpan Kebijakan'}
        </button>
      </div>
    </form>
  );
};
