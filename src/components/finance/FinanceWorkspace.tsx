import React, {useEffect, useMemo, useState} from 'react';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  CheckSquare,
  Download,
  FileBarChart2,
  History,
  LayoutDashboard,
  Moon,
  Paperclip,
  Plus,
  Receipt,
  Settings,
  ShieldCheck,
  Sun,
  Tag,
  Wallet,
} from 'lucide-react';
import {useChurch} from '../../contexts/ChurchContext';
import {useTheme} from '../../contexts/ThemeContext';
import {getNormalizedFinancePermissions, hasFinancePermission} from '../../domain/rbac';
import {
  subscribeFinanceAccounts,
  subscribeFinanceAuditLogs,
  subscribeFinanceCategories,
  subscribeFinanceSettings,
  subscribeFinanceTransactions,
} from '../../services/financeService';
import type {
  FinanceAccount,
  FinanceAuditLog,
  FinanceCategory,
  FinanceSettings,
  FinanceTransaction,
  FinanceViewId,
} from '../../types/domain';
import {extractUserErrorMessage} from '../../utils/firestoreErrors';
import {AccountsBalancesTab} from './AccountsBalancesTab';
import {CategoriesTab} from './CategoriesTab';
import {ExportReportsTab} from './ExportReportsTab';
import {FinanceDashboardTab} from './FinanceDashboardTab';
import {FinancialAuditLogTab} from './FinancialAuditLogTab';
import {FinancialReportsTab} from './FinancialReportsTab';
import {FinancialSettingsTab} from './FinancialSettingsTab';
import {IncomeExpensesTab} from './IncomeExpensesTab';
import {ReceiptsGalleryTab} from './ReceiptsGalleryTab';
import {TransactionApprovalTab} from './TransactionApprovalTab';
import {TransactionFormModal} from './TransactionFormModal';
import {TransactionsWorkbenchTab} from './TransactionsWorkbenchTab';

interface FinanceWorkspaceProps {
  initialTab?: FinanceViewId;
}

interface FinanceTabDef {
  id: FinanceViewId;
  label: string;
  Icon: React.FC<{className?: string}>;
}

const FINANCE_TABS: FinanceTabDef[] = [
  {id: 'overview', label: 'Dashboard', Icon: LayoutDashboard},
  {id: 'income', label: 'Pemasukan', Icon: ArrowDownLeft},
  {id: 'expenses', label: 'Pengeluaran', Icon: ArrowUpRight},
  {id: 'transactions', label: 'Transaksi', Icon: Receipt},
  {id: 'accounts', label: 'Akun & Saldo', Icon: Wallet},
  {id: 'categories', label: 'Kategori', Icon: Tag},
  {id: 'approvals', label: 'Persetujuan', Icon: CheckSquare},
  {id: 'receipts', label: 'Bukti & Kwitansi', Icon: Paperclip},
  {id: 'reports', label: 'Laporan', Icon: FileBarChart2},
  {id: 'export', label: 'Ekspor', Icon: Download},
  {id: 'settings', label: 'Pengaturan', Icon: Settings},
  {id: 'audit', label: 'Log Audit', Icon: History},
];

export const FinanceWorkspace: React.FC<FinanceWorkspaceProps> = ({initialTab = 'overview'}) => {
  const {activeChurch, activeMembership} = useChurch();
  const {theme, toggleTheme} = useTheme();

  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [settings, setSettings] = useState<FinanceSettings | null>(null);
  const [auditLogs, setAuditLogs] = useState<FinanceAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Modal state for Create / Edit Draft Transaction
  const [txModalState, setTxModalState] = useState<{
    open: boolean;
    mode: 'create' | 'edit';
    initialType: 'income' | 'expense';
    initialTx?: FinanceTransaction | null;
  }>({
    open: false,
    mode: 'create',
    initialType: 'income',
    initialTx: null,
  });

  const allowedTabs = useMemo(() => {
    if (!activeMembership) return [];
    return FINANCE_TABS.filter((tab) => {
      switch (tab.id) {
        case 'overview':
          return hasFinancePermission(activeMembership, 'finance.view');
        case 'income':
        case 'expenses':
          return (
            hasFinancePermission(activeMembership, 'finance.view') ||
            hasFinancePermission(activeMembership, 'finance.create')
          );
        case 'transactions':
          return hasFinancePermission(activeMembership, 'finance.view');
        case 'accounts':
          return (
            hasFinancePermission(activeMembership, 'finance.view') ||
            hasFinancePermission(activeMembership, 'finance.manageAccounts')
          );
        case 'categories':
          return (
            hasFinancePermission(activeMembership, 'finance.view') ||
            hasFinancePermission(activeMembership, 'finance.manageCategories')
          );
        case 'approvals':
          return (
            hasFinancePermission(activeMembership, 'finance.approve') ||
            hasFinancePermission(activeMembership, 'finance.reject') ||
            hasFinancePermission(activeMembership, 'finance.void')
          );
        case 'receipts':
          return hasFinancePermission(activeMembership, 'finance.viewReceipts');
        case 'reports':
          return (
            hasFinancePermission(activeMembership, 'finance.viewReports') ||
            hasFinancePermission(activeMembership, 'finance.view')
          );
        case 'export':
          return hasFinancePermission(activeMembership, 'finance.export');
        case 'settings':
          return hasFinancePermission(activeMembership, 'finance.manageSettings');
        case 'audit':
          return (
            hasFinancePermission(activeMembership, 'finance.view') ||
            hasFinancePermission(activeMembership, 'finance.viewReports') ||
            hasFinancePermission(activeMembership, 'finance.approve')
          );
      }
    });
  }, [activeMembership]);

  const [activeTab, setActiveTab] = useState<FinanceViewId>(initialTab);

  // Sync when top-level sidebar route changes (e.g. 'finance' vs 'reports')
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Keep active tab valid when granular permissions update in real time
  useEffect(() => {
    if (allowedTabs.length === 0) return;
    if (!allowedTabs.some((t) => t.id === activeTab)) {
      setActiveTab(allowedTabs[0].id);
    }
  }, [allowedTabs, activeTab]);

  const permSignature = useMemo(() => {
    if (!activeMembership) return '';
    return `${activeMembership.role}:${activeMembership.status}:${getNormalizedFinancePermissions(activeMembership).join(',')}`;
  }, [activeMembership]);

  // Real-time Firestore listeners (immediately reset & re-subscribe on church or permission change)
  useEffect(() => {
    if (!activeChurch || !activeMembership || allowedTabs.length === 0) {
      setAccounts([]);
      setCategories([]);
      setTransactions([]);
      setSettings(null);
      setAuditLogs([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const onSubErr = (err: Error) => {
      setError(extractUserErrorMessage(err, 'Gagal memuat sinkronisasi data keuangan real-time.'));
      setLoading(false);
    };

    const unsubAcc = subscribeFinanceAccounts(
      activeChurch.id,
      activeMembership,
      (rows) => {
        setAccounts(rows);
        setLastSyncedAt(new Date());
        setLoading(false);
      },
      onSubErr,
    );
    const unsubCat = subscribeFinanceCategories(
      activeChurch.id,
      activeMembership,
      (rows) => {
        setCategories(rows);
        setLastSyncedAt(new Date());
      },
      onSubErr,
    );
    const unsubTx = subscribeFinanceTransactions(
      activeChurch.id,
      activeMembership,
      (rows) => {
        setTransactions(rows);
        setLastSyncedAt(new Date());
        setLoading(false);
      },
      onSubErr,
    );
    const unsubSet = subscribeFinanceSettings(
      activeChurch.id,
      activeMembership,
      setSettings,
      onSubErr,
    );
    const unsubAudit = subscribeFinanceAuditLogs(
      activeChurch.id,
      activeMembership,
      (rows) => {
        setAuditLogs(rows);
        setLastSyncedAt(new Date());
      },
      onSubErr,
    );

    return () => {
      unsubAcc();
      unsubCat();
      unsubTx();
      unsubSet();
      unsubAudit();
    };
  }, [activeChurch, activeMembership, permSignature, allowedTabs.length]);

  if (!activeChurch || !activeMembership) {
    return null;
  }

  if (allowedTabs.length === 0) {
    return (
      <section className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-xs text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
        <h2 className="font-display text-base font-semibold">
          Akses Modul Keuangan Belum Diaktifkan
        </h2>
        <p className="mt-1.5 leading-relaxed">
          Church Owner belum memberikan izin keuangan granular kepada akun Anda pada ruang kerja{' '}
          <strong>{activeChurch.name}</strong>.
        </p>
      </section>
    );
  }

  const normalizedPerms = getNormalizedFinancePermissions(activeMembership);
  const canCreate = hasFinancePermission(activeMembership, 'finance.create');
  const pendingCount = transactions.filter((t) => t.status === 'submitted').length;

  const openNewTx = (type: 'income' | 'expense') => {
    setNotice(null);
    setError(null);
    setTxModalState({open: true, mode: 'create', initialType: type, initialTx: null});
  };

  const openEditDraft = (tx: FinanceTransaction) => {
    setNotice(null);
    setError(null);
    setTxModalState({
      open: true,
      mode: 'edit',
      initialType: tx.type === 'expense' ? 'expense' : 'income',
      initialTx: tx,
    });
  };

  return (
    <div className="space-y-6">
      {/* Private Financial Room Header Banner */}
      <section className="no-print rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold tracking-tight text-violet-700 dark:text-violet-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Private Financial Room · Isolasi Data Jemaat Aktif</span>
            </p>
            <h1 className="mt-1 font-display text-xl font-semibold text-slate-900 dark:text-slate-100">
              Manajemen Keuangan — {activeChurch.name}
            </h1>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Mata Uang <span className="font-mono font-medium">{activeChurch.currency}</span>
              <span aria-hidden="true"> · </span>
              Zona Waktu <span className="font-mono font-medium">{activeChurch.timezone}</span>
              <span aria-hidden="true"> · </span>
              Izin Aktif:{' '}
              <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                {activeMembership.role === 'owner'
                  ? 'Akses Penuh Church Owner (13/13)'
                  : `${normalizedPerms.length} izin terotorisasi`}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Aktifkan Mode Terang' : 'Aktifkan Mode Gelap'}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="h-3.5 w-3.5 text-amber-400" />
                  Mode Terang
                </>
              ) : (
                <>
                  <Moon className="h-3.5 w-3.5 text-slate-600" />
                  Mode Gelap
                </>
              )}
            </button>

            {canCreate && (
              <button
                type="button"
                onClick={() => openNewTx('income')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F1E36] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#162A4A] whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" />
                Catat Transaksi
              </button>
            )}
          </div>
        </div>

        {/* 12 Permission-Gated Navigation Tabs */}
        <nav
          aria-label="Navigasi Ruang Keuangan"
          className="mt-4 flex flex-wrap gap-1.5 border-t border-slate-100 pt-4 dark:border-slate-800"
        >
          {allowedTabs.map((tab) => {
            const Icon = tab.Icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setNotice(null);
                  setError(null);
                }}
                aria-current={isActive ? 'page' : undefined}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-[#0F1E36] text-white dark:bg-violet-600'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
                {tab.id === 'approvals' && pendingCount > 0 && (
                  <span className="ml-0.5 rounded bg-amber-400 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-950 tabular-nums">
                    {pendingCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </section>

      {/* Feedback Alerts */}
      {notice && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-xs text-teal-900 dark:border-teal-900/60 dark:bg-teal-950/30 dark:text-teal-200"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" />
          <span>{notice}</span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-700 dark:text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Active Page Content */}
      {loading && accounts.length === 0 && transactions.length === 0 ? (
        <div className="space-y-4">
          <div className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
          <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
        </div>
      ) : (
        <>
          {activeTab === 'overview' && (
            <FinanceDashboardTab
              churchName={activeChurch.name}
              currency={activeChurch.currency}
              timezone={activeChurch.timezone}
              membership={activeMembership}
              accounts={accounts}
              categories={categories}
              transactions={transactions}
              auditLogs={auditLogs}
              lastSyncedAt={lastSyncedAt}
              onNavigateView={setActiveTab}
              onOpenNewTx={openNewTx}
            />
          )}

          {activeTab === 'income' && (
            <IncomeExpensesTab
              mode="income"
              currency={activeChurch.currency}
              membership={activeMembership}
              accounts={accounts}
              categories={categories}
              transactions={transactions}
              onOpenNewTx={openNewTx}
              onEditDraft={openEditDraft}
            />
          )}

          {activeTab === 'expenses' && (
            <IncomeExpensesTab
              mode="expense"
              currency={activeChurch.currency}
              membership={activeMembership}
              accounts={accounts}
              categories={categories}
              transactions={transactions}
              onOpenNewTx={openNewTx}
              onEditDraft={openEditDraft}
            />
          )}

          {activeTab === 'transactions' && (
            <TransactionsWorkbenchTab
              churchId={activeChurch.id}
              currency={activeChurch.currency}
              membership={activeMembership}
              accounts={accounts}
              categories={categories}
              transactions={transactions}
              settings={settings}
              onOpenNewTx={openNewTx}
              onEditDraft={openEditDraft}
              onNotice={setNotice}
              onError={setError}
            />
          )}

          {activeTab === 'accounts' && (
            <AccountsBalancesTab
              churchId={activeChurch.id}
              currency={activeChurch.currency}
              membership={activeMembership}
              accounts={accounts}
              transactions={transactions}
              settings={settings}
              onNotice={setNotice}
              onError={setError}
            />
          )}

          {activeTab === 'categories' && (
            <CategoriesTab
              churchId={activeChurch.id}
              membership={activeMembership}
              categories={categories}
              onNotice={setNotice}
              onError={setError}
            />
          )}

          {activeTab === 'approvals' && (
            <TransactionApprovalTab
              churchId={activeChurch.id}
              currency={activeChurch.currency}
              membership={activeMembership}
              transactions={transactions}
              settings={settings}
              onNotice={setNotice}
              onError={setError}
            />
          )}

          {activeTab === 'receipts' && (
            <ReceiptsGalleryTab
              churchId={activeChurch.id}
              currency={activeChurch.currency}
              membership={activeMembership}
              transactions={transactions}
              settings={settings}
              onNotice={setNotice}
              onError={setError}
            />
          )}

          {activeTab === 'reports' && (
            <FinancialReportsTab
              churchName={activeChurch.name}
              currency={activeChurch.currency}
              membership={activeMembership}
              accounts={accounts}
              categories={categories}
              transactions={transactions}
              onNavigateView={setActiveTab}
            />
          )}

          {activeTab === 'export' && (
            <ExportReportsTab
              church={activeChurch}
              membership={activeMembership}
              accounts={accounts}
              categories={categories}
              transactions={transactions}
              onNotice={setNotice}
              onError={setError}
            />
          )}

          {activeTab === 'settings' && (
            <FinancialSettingsTab
              churchId={activeChurch.id}
              currency={activeChurch.currency}
              membership={activeMembership}
              settings={settings}
              onNotice={setNotice}
              onError={setError}
            />
          )}

          {activeTab === 'audit' && (
            <FinancialAuditLogTab timezone={activeChurch.timezone} auditLogs={auditLogs} />
          )}
        </>
      )}

      {txModalState.open && (
        <TransactionFormModal
          churchId={activeChurch.id}
          currency={activeChurch.currency}
          membership={activeMembership}
          mode={txModalState.mode}
          initialType={txModalState.initialType}
          initialTx={txModalState.initialTx}
          accounts={accounts}
          categories={categories}
          settings={settings}
          onClose={() => setTxModalState((prev) => ({...prev, open: false}))}
          onSaved={(msg) => setNotice(msg)}
        />
      )}
    </div>
  );
};
