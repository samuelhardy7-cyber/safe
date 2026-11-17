import React, {useEffect, useState} from 'react';
import {AuthProvider, useAuth} from './contexts/AuthContext';
import {ChurchProvider, useChurch} from './contexts/ChurchContext';
import {ThemeProvider} from './contexts/ThemeContext';
import {canAccessModule} from './domain/rbac';
import type {NavModuleId} from './types/domain';
import {AuthPortal} from './components/auth/AuthPortal';
import {EmailVerificationGate} from './components/auth/EmailVerificationGate';
import {PinLockScreen} from './components/auth/PinLockScreen';
import {ChurchOnboarding} from './components/church/ChurchOnboarding';
import {ErrorBoundary} from './components/common/ErrorBoundary';
import {AppShell} from './components/layout/AppShell';
import {OfflineIndicator, PWAUpdatePrompt} from './components/pwa/PWAControls';
import {AccountSettingsView} from './components/views/AccountSettingsView';
import {AuditLogView} from './components/views/AuditLogView';
import {BackupRecoveryView} from './components/views/BackupRecoveryView';
import {ChurchSettingsView} from './components/views/ChurchSettingsView';
import {DashboardView} from './components/views/DashboardView';
import {PlatformAdminView} from './components/views/PlatformAdminView';
import {UserManagementView} from './components/views/UserManagementView';
import {CongregationWorkspace} from './components/congregation/CongregationWorkspace';
import {FinanceWorkspace} from './components/finance/FinanceWorkspace';

const HigayonRouter: React.FC = () => {
  const {user, account, isPlatformAdmin, loading, pinLocked, actionLink, lockSessionWithPin, logout} =
    useAuth();
  const {churchRefs, activeChurch, activeMembership, activeSettings, loadingContext, clearActiveChurch} =
    useChurch();

  const [activeNav, setActiveNav] = useState<NavModuleId>('dashboard');
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);

  // Enforce automatic idle session timeout from active church security policy
  useEffect(() => {
    if (!user || !user.emailVerified || pinLocked) return;
    const timeoutMinutes = activeSettings?.sessionTimeoutMinutes ?? 30;
    const timeoutMs = Math.max(5, Math.min(120, timeoutMinutes)) * 60 * 1000;
    let timerId: number;

    const resetTimer = () => {
      window.clearTimeout(timerId);
      timerId = window.setTimeout(() => {
        if (account?.pinEnabled && account.pinHash) {
          lockSessionWithPin();
        } else {
          clearActiveChurch();
          void logout();
        }
      }, timeoutMs);
    };

    const events = ['pointerdown', 'keydown', 'scroll'] as const;
    events.forEach((evt) => window.addEventListener(evt, resetTimer, {passive: true}));
    resetTimer();

    return () => {
      window.clearTimeout(timerId);
      events.forEach((evt) => window.removeEventListener(evt, resetTimer));
    };
  }, [
    user,
    pinLocked,
    activeSettings?.sessionTimeoutMinutes,
    account?.pinEnabled,
    account?.pinHash,
    lockSessionWithPin,
    clearActiveChurch,
    logout,
  ]);

  // Reset active route whenever church context or membership changes so unauthorized views are never left open
  useEffect(() => {
    if (!canAccessModule(activeMembership, activeNav, isPlatformAdmin)) {
      setActiveNav(activeMembership ? 'dashboard' : 'account_settings');
    }
  }, [activeChurch?.id, activeMembership, activeNav, isPlatformAdmin]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-[#0F1E36] dark:border-slate-700 dark:border-t-violet-400" />
          <p className="mt-3 text-xs font-medium text-slate-600 dark:text-slate-300">
            Memuat sistem keamanan Higayon...
          </p>
        </div>
      </div>
    );
  }

  // Handle unauthenticated state or explicit Firebase action links (e.g. password reset)
  if (!user || actionLink.mode === 'resetPassword') {
    return <AuthPortal />;
  }

  // Enforce email verification before allowing private church workspace access
  if (!user.emailVerified) {
    return <EmailVerificationGate />;
  }

  // Optional secondary local-session App PIN lock
  if (pinLocked) {
    return <PinLockScreen />;
  }

  // Wait for user's account doc to synchronize
  if (!account) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
          Menyiapkan profil akun terverifikasi...
        </p>
      </div>
    );
  }

  // Show onboarding when user has no active churches yet OR explicitly requested to create/join another church
  if ((churchRefs.length === 0 && !loadingContext && !isPlatformAdmin) || showOnboardingModal) {
    return (
      <ChurchOnboarding
        allowCancel={churchRefs.length > 0}
        onCancel={() => setShowOnboardingModal(false)}
      />
    );
  }

  const renderActiveView = () => {
    // Platform Admin with no church memberships defaults to Platform Console or Account Settings
    if (!activeMembership && isPlatformAdmin) {
      if (activeNav === 'account_settings') return <AccountSettingsView />;
      return <PlatformAdminView />;
    }

    switch (activeNav) {
      case 'dashboard':
        return <DashboardView onNavigate={setActiveNav} />;
      case 'congregation':
        return <CongregationWorkspace />;
      case 'finance':
        return <FinanceWorkspace initialTab="overview" />;
      case 'reports':
        return <FinanceWorkspace initialTab="reports" />;
      case 'users':
        return <UserManagementView />;
      case 'backup':
        return <BackupRecoveryView />;
      case 'audit':
        return <AuditLogView />;
      case 'church_settings':
        return <ChurchSettingsView />;
      case 'account_settings':
        return <AccountSettingsView />;
      case 'platform_admin':
        return <PlatformAdminView />;
      default:
        return <DashboardView onNavigate={setActiveNav} />;
    }
  };

  return (
    <AppShell
      activeNav={activeNav}
      onSelectNav={setActiveNav}
      onOpenCreateChurch={() => setShowOnboardingModal(true)}
    >
      {renderActiveView()}
    </AppShell>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <ChurchProvider>
            <HigayonRouter />
            <PWAUpdatePrompt />
            <OfflineIndicator />
          </ChurchProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
