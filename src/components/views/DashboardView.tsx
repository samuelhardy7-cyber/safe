import React, {useEffect, useMemo, useState} from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CreditCard,
  DatabaseBackup,
  ShieldCheck,
  Users,
} from 'lucide-react';
import {EmptyStateIllustration, StatusBadge} from '../common/DesignPrimitives';
import {useAuth} from '../../contexts/AuthContext';
import {useChurch} from '../../contexts/ChurchContext';
import {
  canAccessModule,
  getDashboardScope,
  hasFinancePermission,
  requiresStrongAccountProtection,
} from '../../domain/rbac';
import {computeCongregationStats, type CongregationStats} from '../../domain/congregation';
import {
  computeFinanceDashboardMetrics,
  getJakartaDateString,
  resolveDateRange,
} from '../../domain/finance';
import {fetchChurchAuditLogs, fetchChurchMembers} from '../../services/churchService';
import {
  fetchCongregationMembers,
  fetchFamilyGroups,
} from '../../services/congregationService';
import {
  subscribeFinanceAccounts,
  subscribeFinanceTransactions,
} from '../../services/financeService';
import type {
  AuditLogEntry,
  ChurchMembership,
  FinanceAccount,
  FinanceTransaction,
  NavModuleId,
} from '../../types/domain';
import {
  formatCurrency,
  formatDateTimeID,
  getFinancePermissionLabelID,
  getRoleLabelID,
  getStaffPermissionLabelID,
} from '../../utils/formatting';

interface DashboardViewProps {
  onNavigate: (nav: NavModuleId) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({onNavigate}) => {
  const {account} = useAuth();
  const {activeChurch, activeSettings, activeMembership, loadingContext} = useChurch();
  const [members, setMembers] = useState<ChurchMembership[]>([]);
  const [recentLogs, setRecentLogs] = useState<AuditLogEntry[]>([]);
  const [congregationStats, setCongregationStats] = useState<CongregationStats | null>(null);
  const [loadingOwnerData, setLoadingOwnerData] = useState(false);

  const [finAccounts, setFinAccounts] = useState<FinanceAccount[]>([]);
  const [finTransactions, setFinTransactions] = useState<FinanceTransaction[]>([]);

  const scope = getDashboardScope(activeMembership);
  const needsStrongProtection = requiresStrongAccountProtection(activeMembership);
  const canViewFinance = hasFinancePermission(activeMembership, 'finance.view');

  useEffect(() => {
    if (!activeChurch || !activeMembership || activeMembership.role !== 'owner') {
      setMembers([]);
      setRecentLogs([]);
      setCongregationStats(null);
      return;
    }

    let cancelled = false;
    setLoadingOwnerData(true);
    Promise.all([
      fetchChurchMembers(activeChurch.id, activeMembership),
      fetchChurchAuditLogs(activeChurch.id, activeMembership),
      fetchCongregationMembers(activeChurch.id, activeMembership),
      fetchFamilyGroups(activeChurch.id, activeMembership),
    ])
      .then(([m, l, cm, fg]) => {
        if (cancelled) return;
        setMembers(m);
        setRecentLogs(l.slice(0, 5));
        setCongregationStats(computeCongregationStats(cm, fg));
      })
      .catch((err) => {
        console.error('Owner dashboard load error:', err);
      })
      .finally(() => {
        if (!cancelled) setLoadingOwnerData(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeChurch, activeMembership]);

  useEffect(() => {
    if (!activeChurch || !activeMembership || !canViewFinance) {
      setFinAccounts([]);
      setFinTransactions([]);
      return;
    }

    const unsubAcc = subscribeFinanceAccounts(
      activeChurch.id,
      activeMembership,
      setFinAccounts,
      () => undefined,
    );
    const unsubTx = subscribeFinanceTransactions(
      activeChurch.id,
      activeMembership,
      setFinTransactions,
      () => undefined,
    );
    return () => {
      unsubAcc();
      unsubTx();
    };
  }, [activeChurch, activeMembership, canViewFinance]);

  const financeSummary = useMemo(() => {
    const range = resolveDateRange('month', getJakartaDateString());
    return computeFinanceDashboardMetrics(
      finAccounts,
      finTransactions,
      [],
      range.startDate,
      range.endDate,
    );
  }, [finAccounts, finTransactions]);

  if (loadingContext || !activeChurch || !activeMembership) {
    return (
      <div className="space-y-4">
        <div className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
        <div className="grid gap-4 md:grid-cols-3">
          <div className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
          <div className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
          <div className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Summary */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-violet-700 dark:text-violet-400">
              {getRoleLabelID(activeMembership.role)}
              <span aria-hidden="true"> · </span>
              {activeChurch.city}, {activeChurch.country}
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold text-slate-900 dark:text-slate-100">
              {activeChurch.name}
            </h1>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              ID Gereja:{' '}
              <span className="font-mono text-slate-700 dark:text-slate-300">{activeChurch.id}</span>
              <span aria-hidden="true"> · </span>
              Mata Uang:{' '}
              <span className="font-mono text-slate-700 dark:text-slate-300">
                {activeChurch.currency}
              </span>
              <span aria-hidden="true"> · </span>
              Zona Waktu:{' '}
              <span className="font-mono text-slate-700 dark:text-slate-300">
                {activeChurch.timezone}
              </span>
            </p>
          </div>

          {activeMembership.role === 'owner' && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigate('backup')}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <DatabaseBackup className="h-3.5 w-3.5 text-violet-700 dark:text-violet-400" />
                Backup &amp; Pemulihan
              </button>
              <button
                type="button"
                onClick={() => onNavigate('users')}
                className="inline-flex items-center gap-2 rounded-lg bg-[#0F1E36] px-4 py-2 text-xs font-medium text-white hover:bg-[#162A4A] whitespace-nowrap dark:bg-violet-700 dark:hover:bg-violet-600"
              >
                Kelola Pengguna &amp; Izin
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Account Protection Alert for Owner & Finance Approvers */}
      {needsStrongProtection && (!account?.mfaAcknowledged || !account?.pinEnabled) && (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-800/70 dark:bg-amber-950/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
            <div>
              <h2 className="text-sm font-semibold text-amber-950 dark:text-amber-200">
                Rekomendasi Perlindungan Akun Tingkat Tinggi
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-amber-900 dark:text-amber-300">
                Peran Anda memiliki otoritas penuh atau hak persetujuan keuangan. Aktifkan MFA pada
                Firebase Authentication serta PIN sesi lokal di Pengaturan Akun.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('account_settings')}
            className="rounded-lg border border-amber-400 bg-white px-3.5 py-2 text-xs font-medium text-amber-900 hover:bg-amber-100 whitespace-nowrap dark:border-amber-700 dark:bg-slate-900 dark:text-amber-200"
          >
            Buka Pengaturan Keamanan
          </button>
        </section>
      )}

      {/* OWNER DASHBOARD */}
      {scope === 'owner' && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Pengguna Gereja Aktif
              </p>
              <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                {loadingOwnerData ? '...' : members.filter((m) => m.status === 'active').length}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Terisolasi khusus untuk {activeChurch.name}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Jemaat Terdaftar (Khusus Owner)
              </p>
              <p className="mt-2 font-mono text-2xl font-semibold text-[#0F1E36] tabular-nums dark:text-slate-100">
                {loadingOwnerData ? '...' : congregationStats?.totalNonArchived ?? 0}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Aktif {congregationStats?.active ?? 0} · Keluarga {congregationStats?.familyCount ?? 0}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Total Saldo Kas &amp; Bank
              </p>
              <p className="mt-2 font-mono text-2xl font-semibold text-teal-800 tabular-nums dark:text-teal-400">
                {formatCurrency(financeSummary.totalBalance, activeChurch.currency)}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {financeSummary.activeAccountsCount} akun aktif · {financeSummary.pendingCount} menunggu persetujuan
              </p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Core Modules Gateway */}
            <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Modul Inti Gereja
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Akses modul berikut diatur oleh Security Rules dan RBAC per gereja.
              </p>

              <div className="mt-5 divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
                <div className="flex items-center justify-between gap-4 py-4">
                  <div className="flex items-start gap-3">
                    <Users className="mt-0.5 h-5 w-5 text-[#0F1E36] dark:text-slate-200" />
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        Manajemen Jemaat
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Koleksi privat jemaat — hanya Owner yang diizinkan membaca atau menulis.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('congregation')}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Buka
                  </button>
                </div>

                <div className="flex items-center justify-between gap-4 py-4">
                  <div className="flex items-start gap-3">
                    <CreditCard className="mt-0.5 h-5 w-5 text-violet-700 dark:text-violet-400" />
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        Manajemen Keuangan
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Akun kas, persetujuan transaksi, bukti privat, &amp; laporan terotorisasi.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('finance')}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Buka
                  </button>
                </div>
              </div>
            </section>

            {/* Recent Audit Logs */}
            <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                    Aktivitas Audit Terbaru
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Log bersifat append-only dan tidak dapat diubah.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('audit')}
                  className="text-xs font-medium text-violet-700 hover:underline dark:text-violet-400"
                >
                  Lihat Semua
                </button>
              </div>

              {recentLogs.length === 0 ? (
                <div className="mt-4">
                  <EmptyStateIllustration
                    kind="no-data"
                    title="Belum Ada Catatan Audit Terbaru"
                    description="Setiap perubahan hak akses, jemaat, transaksi, dan pencadangan akan otomatis dicatat secara kronologis."
                  />
                </div>
              ) : (
                <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
                  {recentLogs.map((log) => (
                    <li key={log.id} className="py-3">
                      <p className="text-xs font-medium text-slate-900 dark:text-slate-100">
                        {log.summary}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="font-mono">{log.action}</span>
                        <span aria-hidden="true"> · </span>
                        <span>{log.actorEmail}</span>
                        <span aria-hidden="true"> · </span>
                        <span className="tabular-nums">
                          {formatDateTimeID(log.createdAt, activeChurch.timezone)}
                        </span>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-3">
              <DatabaseBackup className="h-4 w-4 text-violet-700 dark:text-violet-400" />
              <div className="text-xs">
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  Kesiapan Backup &amp; Kebijakan Sesi:
                </span>{' '}
                <span className="text-slate-500 dark:text-slate-400">
                  Batas diam {activeSettings?.sessionTimeoutMinutes || 30} menit
                </span>
              </div>
              <StatusBadge
                variant={activeSettings?.automatedBackupEnabled ? 'success' : 'neutral'}
                label={
                  activeSettings?.automatedBackupEnabled
                    ? 'Backup Harian Terjadwal Aktif'
                    : 'Backup Otomatis Nonaktif'
                }
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onNavigate('church_settings')}
                className="text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
              >
                Atur Kebijakan
              </button>
              <button
                type="button"
                onClick={() => onNavigate('backup')}
                className="text-xs font-medium text-violet-700 hover:underline dark:text-violet-400"
              >
                Kelola Backup →
              </button>
            </div>
          </section>
        </>
      )}

      {/* FINANCE DASHBOARD (Strictly ZERO congregation info!) */}
      {scope === 'finance' && (
        <div className="space-y-6">
          {canViewFinance && (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl bg-[#0F1E36] p-5 text-white dark:border dark:border-slate-800 dark:bg-slate-900">
                <p className="text-xs text-blue-200/80">Total Saldo Likuid</p>
                <p className="mt-2 font-mono text-2xl font-bold tabular-nums">
                  {formatCurrency(financeSummary.totalBalance, activeChurch.currency)}
                </p>
                <p className="mt-1 text-[11px] text-blue-200/75">
                  {financeSummary.activeAccountsCount} akun aktif terotorisasi
                </p>
              </div>
              <div className="rounded-xl border border-teal-200 bg-teal-50/70 p-5 dark:border-teal-900/50 dark:bg-teal-950/30">
                <p className="text-xs font-medium text-teal-800 dark:text-teal-300">
                  Pemasukan Bulan Ini
                </p>
                <p className="mt-2 font-mono text-2xl font-bold text-teal-950 tabular-nums dark:text-teal-100">
                  {formatCurrency(financeSummary.periodIncome, activeChurch.currency)}
                </p>
              </div>
              <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-5 dark:border-rose-900/50 dark:bg-rose-950/30">
                <p className="text-xs font-medium text-rose-800 dark:text-rose-300">
                  Pengeluaran Bulan Ini
                </p>
                <p className="mt-2 font-mono text-2xl font-bold text-rose-950 tabular-nums dark:text-rose-100">
                  {formatCurrency(financeSummary.periodExpense, activeChurch.currency)}
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-2.5 text-[#0F1E36] dark:text-slate-100">
                <CreditCard className="h-5 w-5 text-violet-700 dark:text-violet-400" />
                <h2 className="font-display text-base font-semibold">
                  Ruang Lingkup Keuangan Terotorisasi
                </h2>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                Anda masuk sebagai <strong>{getRoleLabelID(activeMembership.role)}</strong>. Hanya
                fitur keuangan yang diizinkan secara eksplisit oleh Church Owner yang aktif untuk
                akun Anda.
              </p>

              <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Izin Keuangan Aktif:
                </p>
                {activeMembership.financePermissions.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    Belum ada izin keuangan eksplisit yang diberikan. Hubungi Church Owner.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                    {activeMembership.financePermissions.map((perm) => (
                      <li key={perm} className="flex items-center gap-2">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>{getFinancePermissionLabelID(perm)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {canAccessModule(activeMembership, 'finance') && (
                <button
                  type="button"
                  onClick={() => onNavigate('finance')}
                  className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#0F1E36] px-4 py-2 text-xs font-medium text-white hover:bg-[#162A4A] dark:bg-violet-700 dark:hover:bg-violet-600"
                >
                  Buka Ruang Keuangan
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Kebijakan Fiskal Gereja
              </h2>
              <dl className="mt-4 divide-y divide-slate-100 text-xs dark:divide-slate-800">
                <div className="flex justify-between py-2.5">
                  <dt className="text-slate-500 dark:text-slate-400">Mata Uang Operasional</dt>
                  <dd className="font-mono font-medium text-slate-900 dark:text-slate-100">
                    {activeChurch.currency}
                  </dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-slate-500 dark:text-slate-400">Awal Tahun Fiskal</dt>
                  <dd className="font-mono font-medium text-slate-900 dark:text-slate-100">
                    Bulan {activeSettings?.fiscalYearStartMonth || 1}
                  </dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-slate-500 dark:text-slate-400">MFA Persetujuan Keuangan</dt>
                  <dd className="font-medium text-slate-900 dark:text-slate-100">
                    {activeSettings?.requireMfaForFinanceApproval ? 'Wajib' : 'Opsional'}
                  </dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-slate-500 dark:text-slate-400">Akses Data Jemaat</dt>
                  <dd className="font-medium text-rose-700 dark:text-rose-400">
                    Diblokir (Khusus Owner)
                  </dd>
                </div>
              </dl>
            </section>
          </div>
        </div>
      )}

      {/* CHURCH STAFF DASHBOARD (Strictly ZERO congregation & finance info!) */}
      {scope === 'staff' && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2.5 text-[#0F1E36] dark:text-slate-100">
            <Building2 className="h-5 w-5 text-violet-700 dark:text-violet-400" />
            <h2 className="font-display text-base font-semibold">
              Ringkasan Operasional Dasar Staf Gereja
            </h2>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            Akun Anda memiliki akses dasar pada ruang kerja <strong>{activeChurch.name}</strong>.
            Data jemaat rahasia dan data keuangan gereja tidak tersedia untuk peran Church Staff.
          </p>

          <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Izin Dasar yang Disetujui Owner:
            </p>
            <ul className="mt-2 space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
              {activeMembership.staffPermissions.map((perm) => (
                <li key={perm} className="flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>{getStaffPermissionLabelID(perm)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
};

