import React, {useState} from 'react';
import {
  Activity,
  Building2,
  ChevronDown,
  CreditCard,
  DatabaseBackup,
  FileBarChart2,
  Lock,
  LogOut,
  Menu,
  Moon,
  Plus,
  RefreshCw,
  Settings,
  Shield,
  ShieldCheck,
  Sun,
  UserCog,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import {useAuth} from '../../contexts/AuthContext';
import {useChurch} from '../../contexts/ChurchContext';
import {useTheme} from '../../contexts/ThemeContext';
import {getNavigationForMembership} from '../../domain/rbac';
import type {NavModuleId} from '../../types/domain';
import {getRoleLabelID} from '../../utils/formatting';
import {PWAInstallButton} from '../pwa/PWAControls';

interface AppShellProps {
  activeNav: NavModuleId;
  onSelectNav: (nav: NavModuleId) => void;
  onOpenCreateChurch: () => void;
  children: React.ReactNode;
}

function getNavIcon(id: NavModuleId) {
  switch (id) {
    case 'dashboard':
      return Activity;
    case 'congregation':
      return Users;
    case 'finance':
      return CreditCard;
    case 'reports':
      return FileBarChart2;
    case 'users':
      return UserCog;
    case 'backup':
      return DatabaseBackup;
    case 'audit':
      return ShieldCheck;
    case 'church_settings':
      return Building2;
    case 'account_settings':
      return Settings;
    case 'platform_admin':
      return Shield;
  }
}

export const AppShell: React.FC<AppShellProps> = ({
  activeNav,
  onSelectNav,
  onOpenCreateChurch,
  children,
}) => {
  const {user, account, isPlatformAdmin, lockSessionWithPin, logout} = useAuth();
  const {
    churchRefs,
    activeChurch,
    activeMembership,
    selectChurch,
    loadingContext,
    syncStatus,
  } = useChurch();
  const {theme, toggleTheme} = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = getNavigationForMembership(activeMembership, isPlatformAdmin);
  const currentNavItem = navItems.find((item) => item.id === activeNav);

  const handleNavClick = (id: NavModuleId) => {
    onSelectNav(id);
    setMobileMenuOpen(false);
  };

  const handleChurchSwitch = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === '__create__') {
      onOpenCreateChurch();
      return;
    }
    if (val && val !== activeChurch?.id) {
      void selectChurch(val);
    }
  };

  const renderSidebarContent = () => (
    <div className="flex h-full flex-col bg-[#0F1E36] text-slate-100">
      {/* Brand Mark */}
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/40 bg-[#162A4A]">
            <Shield className="h-4 w-4 text-amber-400" />
          </div>
          <div>
            <p className="font-display text-sm font-semibold tracking-wide text-white">HIGAYON</p>
            <p className="text-[11px] text-blue-200/75">Church Management</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Tutup menu navigasi"
          className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 lg:hidden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Multi-Church Context Switcher */}
      <div className="border-b border-white/10 px-4 py-4">
        <label
          htmlFor="church-workspace-switcher"
          className="block text-[11px] font-medium text-blue-200/80"
        >
          Gereja Aktif
        </label>
        <div className="relative mt-1.5">
          <select
            id="church-workspace-switcher"
            value={activeChurch?.id || ''}
            disabled={loadingContext || churchRefs.length === 0}
            onChange={handleChurchSwitch}
            className="w-full appearance-none rounded-lg border border-white/15 bg-[#162A4A] py-2 pl-3 pr-8 text-xs font-medium text-white focus:border-violet-400 focus:outline-none"
          >
            {churchRefs.map((ref) => (
              <option key={ref.churchId} value={ref.churchId}>
                {ref.churchName} ({getRoleLabelID(ref.role)})
              </option>
            ))}
            <option value="__create__">+ Tambah / Gabung Gereja</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-300" />
        </div>

        <button
          type="button"
          onClick={() => {
            setMobileMenuOpen(false);
            onOpenCreateChurch();
          }}
          className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-blue-200 hover:text-white"
        >
          <Plus className="h-3 w-3" />
          Buat Gereja Baru / Cek Undangan
        </button>
      </div>

      {/* Role-Filtered Navigation */}
      <nav aria-label="Navigasi Utama" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {(['core', 'governance', 'personal', 'platform'] as const).map((section) => {
          const items = navItems.filter((item) => item.section === section);
          if (items.length === 0) return null;
          const sectionTitle =
            section === 'core'
              ? 'Modul Utama'
              : section === 'governance'
                ? 'Tata Kelola & Keamanan'
                : section === 'personal'
                  ? 'Akun Pribadi'
                  : 'Administrasi Platform';

          return (
            <div key={section}>
              <p className="px-3 text-[11px] font-medium text-slate-400">{sectionTitle}</p>
              <ul className="mt-1.5 space-y-1">
                {items.map((item) => {
                  const Icon = getNavIcon(item.id);
                  const isActive = activeNav === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => handleNavClick(item.id)}
                        aria-current={isActive ? 'page' : undefined}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                          isActive
                            ? 'bg-violet-600/25 text-white ring-1 ring-violet-400/40'
                            : 'text-slate-300 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <Icon
                          className={`h-4 w-4 shrink-0 ${
                            isActive ? 'text-amber-300' : 'text-slate-400'
                          }`}
                        />
                        <span className="truncate">{item.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* Signed-in Identity Footer */}
      <div className="border-t border-white/10 p-4">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-white">
            {account?.displayName || user?.displayName || 'Pengguna'}
          </p>
          <p className="truncate text-[11px] text-slate-400">{user?.email}</p>
          {activeMembership && (
            <p className="mt-1 text-[11px] text-amber-300">
              {getRoleLabelID(activeMembership.role)}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10"
        >
          <LogOut className="h-3.5 w-3.5" />
          Keluar
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 lg:flex dark:bg-slate-950">
      {/* Desktop Fixed Sidebar */}
      <aside className="no-print hidden lg:block lg:w-64 lg:shrink-0">
        <div className="sticky top-0 h-screen">{renderSidebarContent()}</div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="no-print fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-72 max-w-[85vw]">{renderSidebarContent()}</aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-8 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Buka menu navigasi"
              className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50 lg:hidden dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex min-w-0 items-center gap-2 text-xs sm:text-sm">
              <span className="truncate font-medium text-slate-500 dark:text-slate-400">
                {activeChurch?.name || 'Ruang Kerja'}
              </span>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                /
              </span>
              <span className="truncate font-semibold text-slate-900 dark:text-slate-100">
                {currentNavItem?.label || 'Dashboard'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div
              role="status"
              aria-live="polite"
              title="Status koneksi sinkronisasi Firestore real-time"
              className={`hidden sm:inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap ${
                syncStatus === 'synced'
                  ? 'border-teal-200 bg-teal-50/70 text-teal-800 dark:border-teal-900/60 dark:bg-teal-950/40 dark:text-teal-300'
                  : syncStatus === 'syncing'
                    ? 'border-amber-200 bg-amber-50/70 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300'
                    : 'border-rose-200 bg-rose-50/70 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300'
              }`}
            >
              {syncStatus === 'synced' ? (
                <Wifi className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : syncStatus === 'syncing' ? (
                <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
              ) : (
                <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              <span>
                {syncStatus === 'synced'
                  ? 'Terhubung'
                  : syncStatus === 'syncing'
                    ? 'Sinkronisasi'
                    : 'Offline'}
              </span>
            </div>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Ubah ke Mode Terang' : 'Ubah ke Mode Gelap'}
              title={theme === 'dark' ? 'Mode Terang' : 'Mode Gelap'}
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4 text-amber-400" />
              ) : (
                <Moon className="h-4 w-4 text-slate-600" />
              )}
            </button>
            <PWAInstallButton />
            {account?.pinEnabled && (
              <button
                type="button"
                onClick={lockSessionWithPin}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Lock className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                <span className="hidden sm:inline">Kunci Sesi</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => handleNavClick('account_settings')}
              className="rounded-lg bg-[#0F1E36] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#162A4A] whitespace-nowrap shrink-0 dark:bg-violet-700 dark:hover:bg-violet-600"
            >
              <span className="hidden sm:inline">Pengaturan Akun</span>
              <span className="sm:hidden">Akun</span>
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
};
