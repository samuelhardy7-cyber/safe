import type {
  ChurchRole,
  CongregationMemberStatus,
  CongregationRequiredField,
  CurrencyCode,
  FamilyRole,
  FinanceAccountType,
  FinancePaymentMethod,
  FinancePermission,
  FinanceTransactionStatus,
  FinanceTransactionType,
  LocaleCode,
  MembershipStatus,
  StaffPermission,
} from '../types/domain';
import {normalizeFinancePermission} from '../domain/rbac';

export function formatCurrency(
  amount: number,
  currency: CurrencyCode = 'IDR',
  locale: LocaleCode = 'id-ID',
): string {
  const safeVal = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: currency === 'IDR' ? 0 : 2,
    maximumFractionDigits: currency === 'IDR' ? 0 : 2,
  }).format(safeVal);
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as {toDate: () => Date}).toDate === 'function'
  ) {
    return (value as {toDate: () => Date}).toDate();
  }
  if (
    typeof value === 'object' &&
    'seconds' in value &&
    typeof (value as {seconds: number}).seconds === 'number'
  ) {
    return new Date((value as {seconds: number}).seconds * 1000);
  }
  return null;
}

export function formatDateID(
  value: unknown,
  timeZone = 'Asia/Jakarta',
  locale: LocaleCode = 'id-ID',
): string {
  const date = toDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function formatDateTimeID(
  value: unknown,
  timeZone = 'Asia/Jakarta',
  locale: LocaleCode = 'id-ID',
): string {
  const date = toDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function getRoleLabelID(role: ChurchRole): string {
  switch (role) {
    case 'owner':
      return 'Church Owner';
    case 'finance_manager':
      return 'Finance Manager';
    case 'finance_staff':
      return 'Finance Staff';
    case 'church_staff':
      return 'Church Staff';
  }
}

export function getStatusLabelID(status: MembershipStatus | 'pending' | 'accepted' | 'revoked'): string {
  switch (status) {
    case 'active':
      return 'Aktif';
    case 'suspended':
      return 'Ditangguhkan';
    case 'revoked':
      return 'Dicabut';
    case 'pending':
      return 'Menunggu Konfirmasi';
    case 'accepted':
      return 'Diterima';
  }
}

export function getFinancePermissionLabelID(perm: FinancePermission): string {
  const canonical = normalizeFinancePermission(perm);
  switch (canonical) {
    case 'finance.view':
      return 'Lihat Transaksi & Saldo (finance.view)';
    case 'finance.create':
      return 'Buat Transaksi Baru (finance.create)';
    case 'finance.editDraft':
      return 'Ubah Draf Transaksi (finance.editDraft)';
    case 'finance.submit':
      return 'Ajukan Persetujuan (finance.submit)';
    case 'finance.approve':
      return 'Setujui Transaksi (finance.approve)';
    case 'finance.reject':
      return 'Tolak Transaksi (finance.reject)';
    case 'finance.void':
      return 'Batalkan / Void Transaksi (finance.void)';
    case 'finance.export':
      return 'Ekspor Laporan PDF/Excel/CSV (finance.export)';
    case 'finance.viewReports':
      return 'Akses Laporan Keuangan (finance.viewReports)';
    case 'finance.viewReceipts':
      return 'Lihat Bukti & Lampiran (finance.viewReceipts)';
    case 'finance.manageAccounts':
      return 'Kelola Akun Kas & Transfer (finance.manageAccounts)';
    case 'finance.manageCategories':
      return 'Kelola Kategori Keuangan (finance.manageCategories)';
    case 'finance.manageSettings':
      return 'Kelola Pengaturan Keuangan (finance.manageSettings)';
    default:
      return String(perm);
  }
}

export function getStaffPermissionLabelID(perm: StaffPermission): string {
  switch (perm) {
    case 'dashboard:basic':
      return 'Dashboard Dasar Gereja';
    case 'church:view_profile':
      return 'Lihat Profil Umum Gereja';
  }
}

export function getMemberStatusLabelID(status: CongregationMemberStatus): string {
  switch (status) {
    case 'active':
      return 'Aktif';
    case 'inactive':
      return 'Nonaktif';
    case 'visiting':
      return 'Tamu / Simpatisan';
    case 'moved':
      return 'Pindah Gereja';
    case 'deceased':
      return 'Meninggal Dunia';
  }
}

export function getFamilyRoleLabelID(role?: FamilyRole): string {
  switch (role) {
    case 'head':
      return 'Kepala Keluarga';
    case 'spouse':
      return 'Pasangan';
    case 'child':
      return 'Anak';
    case 'parent':
      return 'Orang Tua';
    case 'other':
      return 'Anggota Keluarga Lainnya';
    default:
      return 'Belum Ditentukan';
  }
}

export function getRequiredFieldLabelID(field: CongregationRequiredField): string {
  switch (field) {
    case 'fullName':
      return 'Nama Lengkap';
    case 'nickname':
      return 'Nama Panggilan';
    case 'gender':
      return 'Jenis Kelamin';
    case 'birthDate':
      return 'Tanggal Lahir';
    case 'phone':
      return 'Nomor Telepon';
    case 'email':
      return 'Email';
    case 'address':
      return 'Alamat Tempat Tinggal';
    case 'joinedDate':
      return 'Tanggal Mulai Anggota';
    case 'status':
      return 'Status Keanggotaan';
    case 'familyGroupId':
      return 'Kelompok Keluarga';
  }
}

export function getTxTypeLabelID(type: FinanceTransactionType): string {
  switch (type) {
    case 'income':
      return 'Pemasukan';
    case 'expense':
      return 'Pengeluaran';
    case 'transfer':
      return 'Transfer Antar Akun';
  }
}

export function getTxStatusLabelID(status: FinanceTransactionStatus): string {
  switch (status) {
    case 'draft':
      return 'Draf';
    case 'submitted':
      return 'Menunggu Persetujuan';
    case 'approved':
      return 'Disetujui';
    case 'locked':
      return 'Terkunci';
    case 'rejected':
      return 'Ditolak';
    case 'voided':
      return 'Dibatalkan (Void)';
  }
}

export function getAccountTypeLabelID(type: FinanceAccountType): string {
  switch (type) {
    case 'cash':
      return 'Kas Tunai';
    case 'bank':
      return 'Rekening Bank';
    case 'operational':
      return 'Dana Operasional';
    case 'building':
      return 'Dana Pembangunan';
    case 'other':
      return 'Akun Lainnya';
  }
}

export function getPaymentMethodLabelID(method: FinancePaymentMethod): string {
  switch (method) {
    case 'cash':
      return 'Tunai';
    case 'bank_transfer':
      return 'Transfer Bank';
    case 'qris':
      return 'QRIS';
    case 'debit_card':
      return 'Kartu Debit';
    case 'check':
      return 'Cek / Giro';
    case 'other':
      return 'Metode Lainnya';
  }
}
