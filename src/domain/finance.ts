import type {
  ChurchMembership,
  CurrencyCode,
  FinanceAccount,
  FinanceAccountType,
  FinanceCategory,
  FinancePaymentMethod,
  FinanceSettings,
  FinanceTransaction,
  FinanceTransactionStatus,
  FinanceTransactionType,
} from '../types/domain';
import {hasFinancePermission} from './rbac';

export type FinancePeriodPreset = 'today' | 'week' | 'month' | 'year' | 'all' | 'custom';

export interface IntegerParseResult {
  valid: boolean;
  value: number;
  error?: string;
}

export const DEFAULT_INCOME_CATEGORIES: Array<{
  code: string;
  name: string;
  description: string;
  color: string;
}> = [
  {code: 'INC-PERSEMBAHAN', name: 'Persembahan Mingguan', description: 'Kolekte dan persembahan ibadah raya', color: '#0F766E'},
  {code: 'INC-PERPULUHAN', name: 'Perpuluhan', description: 'Persepuluhan reguler dengan kode anonim', color: '#0369A1'},
  {code: 'INC-SYUKUR', name: 'Persembahan Syukur', description: 'Ucapan syukur khusus dan nazar', color: '#0284C7'},
  {code: 'INC-MISI', name: 'Dana Misi & Diakonia', description: 'Dukungan misi dan pelayanan sosial', color: '#4338CA'},
  {code: 'INC-PEMBANGUNAN', name: 'Dana Pembangunan', description: 'Persembahan khusus gedung & renovasi', color: '#0D9488'},
];

export const DEFAULT_EXPENSE_CATEGORIES: Array<{
  code: string;
  name: string;
  description: string;
  color: string;
}> = [
  {code: 'EXP-OPS', name: 'Operasional & Utilitas', description: 'Listrik, air, internet, kebersihan gedung', color: '#B45309'},
  {code: 'EXP-DIAKONIA', name: 'Pelayanan & Diakonia', description: 'Bantuan sosial dan pelayanan jemaat', color: '#BE123C'},
  {code: 'EXP-IBADAH', name: 'Perlengkapan Ibadah', description: 'Musik, multimedia, perjamuan, liturgi', color: '#9F1239'},
  {code: 'EXP-PEMELIHARAAN', name: 'Pemeliharaan Aset', description: 'Servis AC, audio, dan perawatan bangunan', color: '#475569'},
  {code: 'EXP-HONOR', name: 'Honorarium & Staf', description: 'Dukungan pelayan penuh waktu & staf gereja', color: '#991B1B'},
];

export function getJakartaDateString(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value || '2026';
  const month = parts.find((p) => p.type === 'month')?.value || '01';
  const day = parts.find((p) => p.type === 'day')?.value || '01';
  return `${year}-${month}-${day}`;
}

export function validateSafeIntegerAmount(raw: unknown, allowZero = false): IntegerParseResult {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || !Number.isSafeInteger(raw)) {
      return {valid: false, value: 0, error: 'Nominal harus berupa bilangan bulat (tanpa desimal).'};
    }
    if (allowZero ? raw < 0 : raw <= 0) {
      return {
        valid: false,
        value: 0,
        error: allowZero ? 'Nominal tidak boleh bernilai negatif.' : 'Nominal harus lebih dari 0.',
      };
    }
    if (raw > 1_000_000_000_000) {
      return {valid: false, value: 0, error: 'Nominal melebihi batas maksimum transaksi yang aman.'};
    }
    return {valid: true, value: raw};
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim().replace(/\s+/g, '');
    if (!trimmed) {
      return {valid: false, value: 0, error: 'Nominal wajib diisi.'};
    }
    if (!/^\d+$/.test(trimmed)) {
      return {
        valid: false,
        value: 0,
        error: 'Masukkan nominal dalam angka bulat Rupiah tanpa desimal atau karakter lain.',
      };
    }
    const parsed = Number(trimmed);
    return validateSafeIntegerAmount(parsed, allowZero);
  }

  return {valid: false, value: 0, error: 'Format nominal tidak valid.'};
}

export function validateAnonymousRefCode(raw?: string): {valid: boolean; value: string; error?: string} {
  const value = (raw || '').trim();
  if (!value) return {valid: true, value: ''};
  if (value.includes('@')) {
    return {
      valid: false,
      value: '',
      error: 'Kode referensi anonim tidak boleh berupa alamat email atau identitas jemaat.',
    };
  }
  if (value.length > 40) {
    return {valid: false, value: '', error: 'Kode referensi anonim maksimal 40 karakter.'};
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    return {
      valid: false,
      value: '',
      error: 'Kode referensi anonim hanya boleh berisi huruf, angka, tanda hubung (-), atau garis bawah (_).',
    };
  }
  return {valid: true, value};
}

export interface TransactionDraftInput {
  type: FinanceTransactionType;
  date: string;
  categoryId?: string;
  description: string;
  amount: number | string;
  accountId: string;
  toAccountId?: string;
  paymentMethod: FinancePaymentMethod;
  anonymousRefCode?: string;
  counterparty?: string;
  receiptNumber?: string;
  hasAttachment?: boolean;
}

export function validateTransactionInput(
  input: TransactionDraftInput,
  settings?: FinanceSettings | null,
): {valid: boolean; amount: number; anonymousRefCode: string; error?: string} {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return {valid: false, amount: 0, anonymousRefCode: '', error: 'Tanggal transaksi tidak valid (YYYY-MM-DD).'};
  }

  if (settings?.fiscalLockBeforeDate && input.date < settings.fiscalLockBeforeDate) {
    return {
      valid: false,
      amount: 0,
      anonymousRefCode: '',
      error: `Periode sebelum ${settings.fiscalLockBeforeDate} telah dikunci secara fiskal.`,
    };
  }

  if (!['income', 'expense', 'transfer'].includes(input.type)) {
    return {valid: false, amount: 0, anonymousRefCode: '', error: 'Jenis transaksi tidak valid.'};
  }

  if ((input.type === 'income' || input.type === 'expense') && !input.categoryId) {
    return {valid: false, amount: 0, anonymousRefCode: '', error: 'Kategori wajib dipilih.'};
  }

  const desc = input.description.trim();
  if (desc.length < 2 || desc.length > 400) {
    return {valid: false, amount: 0, anonymousRefCode: '', error: 'Deskripsi transaksi harus antara 2–400 karakter.'};
  }

  const amountCheck = validateSafeIntegerAmount(input.amount, false);
  if (!amountCheck.valid) {
    return {valid: false, amount: 0, anonymousRefCode: '', error: amountCheck.error};
  }

  if (!input.accountId) {
    return {valid: false, amount: 0, anonymousRefCode: '', error: 'Akun kas/bank wajib dipilih.'};
  }

  if (input.type === 'transfer') {
    if (!input.toAccountId) {
      return {valid: false, amount: 0, anonymousRefCode: '', error: 'Akun tujuan transfer wajib dipilih.'};
    }
    if (input.toAccountId === input.accountId) {
      return {valid: false, amount: 0, anonymousRefCode: '', error: 'Akun sumber dan tujuan transfer harus berbeda.'};
    }
  }

  const refCheck = validateAnonymousRefCode(input.anonymousRefCode);
  if (!refCheck.valid) {
    return {valid: false, amount: 0, anonymousRefCode: '', error: refCheck.error};
  }

  if (input.counterparty && input.counterparty.trim().length > 120) {
    return {valid: false, amount: 0, anonymousRefCode: '', error: 'Nama vendor/pihak terkait maksimal 120 karakter.'};
  }

  if (input.receiptNumber && input.receiptNumber.trim().length > 60) {
    return {valid: false, amount: 0, anonymousRefCode: '', error: 'Nomor bukti maksimal 60 karakter.'};
  }

  return {
    valid: true,
    amount: amountCheck.value,
    anonymousRefCode: refCheck.value,
  };
}

export function validateAccountInput(input: {
  name: string;
  accountType: FinanceAccountType;
  openingBalance: number | string;
}): {valid: boolean; openingBalance: number; error?: string} {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120) {
    return {valid: false, openingBalance: 0, error: 'Nama akun harus antara 2–120 karakter.'};
  }
  if (!['cash', 'bank', 'operational', 'building', 'other'].includes(input.accountType)) {
    return {valid: false, openingBalance: 0, error: 'Tipe akun tidak valid.'};
  }
  const bal = validateSafeIntegerAmount(input.openingBalance, true);
  if (!bal.valid) {
    return {valid: false, openingBalance: 0, error: bal.error};
  }
  return {valid: true, openingBalance: bal.value};
}

export function canEditTransactionDraft(
  membership: ChurchMembership | null | undefined,
  tx: FinanceTransaction,
): boolean {
  if (!hasFinancePermission(membership, 'finance.editDraft')) return false;
  return tx.status === 'draft' || tx.status === 'rejected';
}

export function canSubmitTransaction(
  membership: ChurchMembership | null | undefined,
  tx: FinanceTransaction,
): boolean {
  if (!hasFinancePermission(membership, 'finance.submit')) return false;
  return tx.status === 'draft' || tx.status === 'rejected';
}

export function canApproveTransaction(
  membership: ChurchMembership | null | undefined,
  tx: FinanceTransaction,
  settings?: FinanceSettings | null,
): {allowed: boolean; requiresOwnerOverride: boolean; reason?: string} {
  if (!membership || membership.status !== 'active') {
    return {allowed: false, requiresOwnerOverride: false, reason: 'Keanggotaan tidak aktif.'};
  }
  if (!hasFinancePermission(membership, 'finance.approve')) {
    return {allowed: false, requiresOwnerOverride: false, reason: 'Tidak memiliki izin persetujuan.'};
  }
  if (tx.status !== 'submitted') {
    return {
      allowed: false,
      requiresOwnerOverride: false,
      reason: 'Hanya transaksi berstatus Menunggu Persetujuan yang dapat disetujui.',
    };
  }

  if (tx.createdBy === membership.uid) {
    if (membership.role !== 'owner') {
      return {
        allowed: false,
        requiresOwnerOverride: false,
        reason: 'Pembuat transaksi tidak boleh menyetujui transaksinya sendiri (Pemisahan Tugas).',
      };
    }
    if (settings && !settings.allowOwnerSelfApproveOverride) {
      return {
        allowed: false,
        requiresOwnerOverride: false,
        reason: 'Override persetujuan diri sendiri oleh Owner dinonaktifkan pada pengaturan keuangan.',
      };
    }
    return {allowed: true, requiresOwnerOverride: true};
  }

  return {allowed: true, requiresOwnerOverride: false};
}

export function canRejectTransaction(
  membership: ChurchMembership | null | undefined,
  tx: FinanceTransaction,
): boolean {
  if (!hasFinancePermission(membership, 'finance.reject')) return false;
  return tx.status === 'submitted';
}

export function canVoidTransaction(
  membership: ChurchMembership | null | undefined,
  tx: FinanceTransaction,
): boolean {
  if (!hasFinancePermission(membership, 'finance.void')) return false;
  return tx.status === 'approved' || tx.status === 'locked';
}

export function computeApprovalBalanceDeltas(
  tx: Pick<FinanceTransaction, 'type' | 'amount' | 'accountId' | 'toAccountId'>,
): Array<{accountId: string; delta: number}> {
  if (tx.type === 'income') {
    return [{accountId: tx.accountId, delta: tx.amount}];
  }
  if (tx.type === 'expense') {
    return [{accountId: tx.accountId, delta: -tx.amount}];
  }
  if (tx.type === 'transfer' && tx.toAccountId) {
    return [
      {accountId: tx.accountId, delta: -tx.amount},
      {accountId: tx.toAccountId, delta: tx.amount},
    ];
  }
  return [];
}

export function computeVoidBalanceDeltas(
  tx: Pick<FinanceTransaction, 'type' | 'amount' | 'accountId' | 'toAccountId'>,
): Array<{accountId: string; delta: number}> {
  return computeApprovalBalanceDeltas(tx).map((entry) => ({
    accountId: entry.accountId,
    delta: -entry.delta,
  }));
}

export function resolveDateRange(
  preset: FinancePeriodPreset,
  referenceDateStr = getJakartaDateString(),
  customStart = '',
  customEnd = '',
): {startDate: string; endDate: string; label: string} {
  const [y, m, d] = referenceDateStr.split('-').map(Number);
  const ref = new Date(Date.UTC(y, (m || 1) - 1, d || 1));

  switch (preset) {
    case 'today':
      return {startDate: referenceDateStr, endDate: referenceDateStr, label: 'Hari Ini'};
    case 'week': {
      const dayOfWeek = ref.getUTCDay(); // 0=Sun..6=Sat
      const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const start = new Date(ref.getTime() - diffToMonday * 86400_000);
      return {
        startDate: start.toISOString().slice(0, 10),
        endDate: referenceDateStr,
        label: 'Minggu Ini',
      };
    }
    case 'month':
      return {
        startDate: `${referenceDateStr.slice(0, 7)}-01`,
        endDate: referenceDateStr,
        label: 'Bulan Ini',
      };
    case 'year':
      return {
        startDate: `${referenceDateStr.slice(0, 4)}-01-01`,
        endDate: `${referenceDateStr.slice(0, 4)}-12-31`,
        label: `Tahun ${referenceDateStr.slice(0, 4)}`,
      };
    case 'custom':
      return {
        startDate: customStart || '2000-01-01',
        endDate: customEnd || '2099-12-31',
        label: `${customStart || '...'} s/d ${customEnd || '...'}`,
      };
    case 'all':
    default:
      return {startDate: '1900-01-01', endDate: '2999-12-31', label: 'Semua Periode'};
  }
}

export function filterTransactionsByPeriod(
  transactions: readonly FinanceTransaction[],
  startDate: string,
  endDate: string,
): FinanceTransaction[] {
  return transactions.filter((tx) => tx.date >= startDate && tx.date <= endDate);
}

export interface MonthlyCashflowPoint {
  month: string; // YYYY-MM
  label: string;
  income: number;
  expense: number;
  net: number;
}

export interface CategoryBreakdownItem {
  categoryId: string;
  categoryName: string;
  color: string;
  total: number;
  count: number;
  percentage: number;
}

export interface FinanceDashboardMetrics {
  totalBalance: number;
  activeAccountsCount: number;
  periodIncome: number;
  periodExpense: number;
  netSurplus: number;
  approvedCount: number;
  pendingCount: number;
  pendingTotal: number;
  draftCount: number;
  rejectedCount: number;
  voidedCount: number;
  monthlySeries: MonthlyCashflowPoint[];
  incomeCategories: CategoryBreakdownItem[];
  expenseCategories: CategoryBreakdownItem[];
}

export function isPostedStatus(status: FinanceTransactionStatus): boolean {
  return status === 'approved' || status === 'locked';
}

function formatMonthLabelID(ym: string): string {
  const [y, m] = ym.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const idx = Number(m) - 1;
  return `${names[idx] || m} '${y.slice(2)}`;
}

export function computeFinanceDashboardMetrics(
  accounts: readonly FinanceAccount[],
  allTransactions: readonly FinanceTransaction[],
  categories: readonly FinanceCategory[],
  startDate: string,
  endDate: string,
  scopeMonthlyToPeriod = false,
): FinanceDashboardMetrics {
  const activeAccounts = accounts.filter((a) => a.status !== 'archived');
  const totalBalance = activeAccounts.reduce((acc, a) => acc + a.currentBalance, 0);

  const periodTxs = filterTransactionsByPeriod(allTransactions, startDate, endDate);
  const postedPeriod = periodTxs.filter((tx) => isPostedStatus(tx.status));

  let periodIncome = 0;
  let periodExpense = 0;
  for (const tx of postedPeriod) {
    if (tx.type === 'income') periodIncome += tx.amount;
    if (tx.type === 'expense') periodExpense += tx.amount;
  }

  const pendingTxs = allTransactions.filter((tx) => tx.status === 'submitted');
  const pendingTotal = pendingTxs.reduce((acc, tx) => acc + tx.amount, 0);

  const catColorMap = new Map<string, string>();
  for (const c of categories) {
    catColorMap.set(c.id, c.color);
  }

  const buildBreakdown = (kind: 'income' | 'expense', grandTotal: number): CategoryBreakdownItem[] => {
    const map = new Map<string, {name: string; color: string; total: number; count: number}>();
    for (const tx of postedPeriod) {
      if (tx.type !== kind) continue;
      const cid = tx.categoryId || 'uncategorized';
      const cname = tx.categoryName || 'Tanpa Kategori';
      const existing = map.get(cid);
      const color =
        catColorMap.get(cid) || (kind === 'income' ? '#0F766E' : '#BE123C');
      if (existing) {
        existing.total += tx.amount;
        existing.count += 1;
      } else {
        map.set(cid, {name: cname, color, total: tx.amount, count: 1});
      }
    }
    return Array.from(map.entries())
      .map(([categoryId, info]) => ({
        categoryId,
        categoryName: info.name,
        color: info.color,
        total: info.total,
        count: info.count,
        percentage: grandTotal > 0 ? Math.round((info.total / grandTotal) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);
  };

  // Monthly series across period or latest 6 active months
  const monthSource = scopeMonthlyToPeriod ? postedPeriod : allTransactions;
  const monthMap = new Map<string, {income: number; expense: number}>();
  for (const tx of monthSource) {
    if (!isPostedStatus(tx.status) || tx.type === 'transfer') continue;
    const ym = tx.date.slice(0, 7);
    const entry = monthMap.get(ym) || {income: 0, expense: 0};
    if (tx.type === 'income') entry.income += tx.amount;
    if (tx.type === 'expense') entry.expense += tx.amount;
    monthMap.set(ym, entry);
  }

  const sortedMonths = Array.from(monthMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const monthlySeries = (scopeMonthlyToPeriod ? sortedMonths : sortedMonths.slice(-6)).map(([month, vals]) => ({
      month,
      label: formatMonthLabelID(month),
      income: vals.income,
      expense: vals.expense,
      net: vals.income - vals.expense,
    }));

  return {
    totalBalance,
    activeAccountsCount: activeAccounts.length,
    periodIncome,
    periodExpense,
    netSurplus: periodIncome - periodExpense,
    approvedCount: postedPeriod.length,
    pendingCount: pendingTxs.length,
    pendingTotal,
    draftCount: allTransactions.filter((tx) => tx.status === 'draft').length,
    rejectedCount: allTransactions.filter((tx) => tx.status === 'rejected').length,
    voidedCount: allTransactions.filter((tx) => tx.status === 'voided').length,
    monthlySeries,
    incomeCategories: buildBreakdown('income', periodIncome),
    expenseCategories: buildBreakdown('expense', periodExpense),
  };
}

export interface AccountMutationEntry {
  transactionId: string;
  txCode: string;
  date: string;
  description: string;
  delta: number;
  runningBalance: number;
  status: FinanceTransactionStatus;
}

export function computeAccountMutationLedger(
  account: FinanceAccount,
  transactions: readonly FinanceTransaction[],
): AccountMutationEntry[] {
  const relevant = transactions
    .filter(
      (tx) =>
        isPostedStatus(tx.status) &&
        (tx.accountId === account.id || tx.toAccountId === account.id),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.txCode.localeCompare(b.txCode));

  let running = account.openingBalance;
  const entries: AccountMutationEntry[] = [];

  for (const tx of relevant) {
    let delta = 0;
    if (tx.type === 'income' && tx.accountId === account.id) {
      delta = tx.amount;
    } else if (tx.type === 'expense' && tx.accountId === account.id) {
      delta = -tx.amount;
    } else if (tx.type === 'transfer') {
      if (tx.accountId === account.id) delta = -tx.amount;
      if (tx.toAccountId === account.id) delta = tx.amount;
    }
    if (delta === 0) continue;
    running += delta;
    entries.push({
      transactionId: tx.id,
      txCode: tx.txCode,
      date: tx.date,
      description: tx.description,
      delta,
      runningBalance: running,
      status: tx.status,
    });
  }

  return entries.reverse();
}

function escapeCsvCell(raw: string): string {
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function buildFinanceCsvExport(
  transactions: readonly FinanceTransaction[],
  currency: CurrencyCode = 'IDR',
): string {
  const headers = [
    'Kode Transaksi',
    'Tanggal',
    'Jenis',
    'Kategori',
    'Deskripsi',
    `Nominal (${currency})`,
    'Akun Sumber',
    'Akun Tujuan',
    'Metode Pembayaran',
    'Kode Ref Anonim',
    'Pihak Terkait / Vendor',
    'Nomor Bukti',
    'Status',
  ];

  const rows = transactions.map((tx) =>
    [
      tx.txCode,
      tx.date,
      tx.type,
      tx.categoryName || '',
      tx.description,
      String(tx.amount),
      tx.accountName,
      tx.toAccountName || '',
      tx.paymentMethod,
      tx.anonymousRefCode || '',
      tx.counterparty || '',
      tx.receiptNumber || '',
      tx.status,
    ]
      .map(escapeCsvCell)
      .join(','),
  );

  return '\uFEFF' + [headers.map(escapeCsvCell).join(','), ...rows].join('\r\n');
}
