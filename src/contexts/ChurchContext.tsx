import React, {createContext, useCallback, useContext, useEffect, useState} from 'react';
import {doc, onSnapshot} from 'firebase/firestore';
import {db} from '../firebase';
import {
  acceptChurchInvitation,
  loadActiveChurchContext,
  subscribePendingInvitationsForEmail,
  subscribeUserChurchRefs,
} from '../services/churchService';
import type {
  Church,
  ChurchInvitation,
  ChurchMembership,
  ChurchSettings,
  UserChurchRef,
} from '../types/domain';
import {useAuth} from './AuthContext';

export type SyncConnectionStatus = 'synced' | 'syncing' | 'offline';

interface ChurchContextValue {
  churchRefs: UserChurchRef[];
  pendingInvitations: ChurchInvitation[];
  activeChurchId: string | null;
  activeChurch: Church | null;
  activeSettings: ChurchSettings | null;
  activeMembership: ChurchMembership | null;
  loadingContext: boolean;
  contextError: string | null;
  syncStatus: SyncConnectionStatus;
  lastSyncedAt: Date | null;
  selectChurch: (churchId: string) => Promise<void>;
  reloadActiveChurch: () => Promise<void>;
  acceptInvite: (invite: ChurchInvitation) => Promise<void>;
  clearActiveChurch: () => void;
}

const ChurchContext = createContext<ChurchContextValue | null>(null);

export const ChurchProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const {user, account} = useAuth();
  const [churchRefs, setChurchRefs] = useState<UserChurchRef[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<ChurchInvitation[]>([]);
  const [activeChurchId, setActiveChurchId] = useState<string | null>(null);
  const [activeChurch, setActiveChurch] = useState<Church | null>(null);
  const [activeSettings, setActiveSettings] = useState<ChurchSettings | null>(null);
  const [activeMembership, setActiveMembership] = useState<ChurchMembership | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncConnectionStatus>(() =>
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'syncing',
  );
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  useEffect(() => {
    const onOnline = () => setSyncStatus('synced');
    const onOffline = () => setSyncStatus('offline');
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const clearActiveChurch = useCallback(() => {
    setActiveChurchId(null);
    setActiveChurch(null);
    setActiveSettings(null);
    setActiveMembership(null);
    setContextError(null);
    sessionStorage.removeItem('higayon_active_church_id');
  }, []);

  const selectChurch = useCallback(
    async (churchId: string) => {
      if (!user || !user.emailVerified) return;
      // Strict tenant context reset before loading new church so two churches never mix in state
      setLoadingContext(true);
      setSyncStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'syncing');
      setContextError(null);
      setActiveChurch(null);
      setActiveSettings(null);
      setActiveMembership(null);
      setActiveChurchId(churchId);
      sessionStorage.setItem('higayon_active_church_id', churchId);

      try {
        const result = await loadActiveChurchContext(user.uid, churchId);
        setActiveChurch(result.church);
        setActiveSettings(result.settings);
        setActiveMembership(result.membership);
        setSyncStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'synced');
        setLastSyncedAt(new Date());
      } catch (err) {
        setContextError(err instanceof Error ? err.message : 'Gagal memuat konteks gereja.');
        setActiveChurchId(null);
        sessionStorage.removeItem('higayon_active_church_id');
      } finally {
        setLoadingContext(false);
      }
    },
    [user],
  );

  const reloadActiveChurch = useCallback(async () => {
    if (activeChurchId) {
      await selectChurch(activeChurchId);
    }
  }, [activeChurchId, selectChurch]);

  // Subscribe to user's church memberships list & pending invitations when authenticated + verified
  useEffect(() => {
    if (!user || !user.emailVerified) {
      setChurchRefs([]);
      setPendingInvitations([]);
      clearActiveChurch();
      return;
    }

    const unsubRefs = subscribeUserChurchRefs(
      user.uid,
      (refs) => {
        const activeRefs = refs.filter((r) => r.status === 'active');
        setChurchRefs(activeRefs);
        setLastSyncedAt(new Date());
        if (typeof navigator === 'undefined' || navigator.onLine) setSyncStatus('synced');
      },
      (err) => {
        setContextError(err.message);
      },
    );

    const unsubInvites = user.email
      ? subscribePendingInvitationsForEmail(
          user.email,
          (invites) => setPendingInvitations(invites),
          (err) => console.error('Invite listener error:', err.message),
        )
      : () => {};

    return () => {
      unsubRefs();
      unsubInvites();
    };
  }, [user, clearActiveChurch]);

  // Real-time membership listener so permission grants or revocations affect active session immediately
  useEffect(() => {
    if (!user || !user.emailVerified || !activeChurchId) return;

    const membershipRef = doc(db, 'churches', activeChurchId, 'memberships', user.uid);
    const unsubMembership = onSnapshot(
      membershipRef,
      (snap) => {
        if (!snap.exists()) {
          clearActiveChurch();
          return;
        }
        const liveMembership = snap.data() as ChurchMembership;
        if (liveMembership.status !== 'active') {
          setContextError('Keanggotaan atau izin Anda pada gereja ini telah dinonaktifkan.');
          clearActiveChurch();
          return;
        }
        setActiveMembership(liveMembership);
        setLastSyncedAt(new Date());
        if (typeof navigator === 'undefined' || navigator.onLine) setSyncStatus('synced');
      },
      (err) => {
        console.error('Membership listener error:', err.message);
      },
    );

    const settingsRef = doc(db, 'churches', activeChurchId, 'settings', 'general');
    const unsubSettings = onSnapshot(
      settingsRef,
      (snap) => {
        if (snap.exists()) {
          setActiveSettings(snap.data() as ChurchSettings);
          setLastSyncedAt(new Date());
        }
      },
      () => {
        // Ignore transient settings listener errors
      },
    );

    return () => {
      unsubMembership();
      unsubSettings();
    };
  }, [user, activeChurchId, clearActiveChurch]);

  // Automatically load initial church if user has active memberships and none is loaded yet
  useEffect(() => {
    if (!user || !user.emailVerified || churchRefs.length === 0) return;

    const storedId = sessionStorage.getItem('higayon_active_church_id');
    const preferredId = account?.defaultChurchId;

    if (activeChurchId) {
      const stillValid = churchRefs.some((r) => r.churchId === activeChurchId);
      if (!stillValid) {
        clearActiveChurch();
      }
      return;
    }

    const target =
      churchRefs.find((r) => r.churchId === storedId) ||
      churchRefs.find((r) => r.churchId === preferredId) ||
      churchRefs[0];

    if (target) {
      void selectChurch(target.churchId);
    }
  }, [user, account, churchRefs, activeChurchId, selectChurch, clearActiveChurch]);

  const acceptInvite = useCallback(
    async (invite: ChurchInvitation) => {
      if (!user || !account) throw new Error('Akun belum siap.');
      await acceptChurchInvitation(user, account, invite);
      await selectChurch(invite.churchId);
    },
    [user, account, selectChurch],
  );

  return (
    <ChurchContext.Provider
      value={{
        churchRefs,
        pendingInvitations,
        activeChurchId,
        activeChurch,
        activeSettings,
        activeMembership,
        loadingContext,
        contextError,
        syncStatus,
        lastSyncedAt,
        selectChurch,
        reloadActiveChurch,
        acceptInvite,
        clearActiveChurch,
      }}
    >
      {children}
    </ChurchContext.Provider>
  );
};

export function useChurch(): ChurchContextValue {
  const ctx = useContext(ChurchContext);
  if (!ctx) throw new Error('useChurch harus digunakan di dalam ChurchProvider.');
  return ctx;
}
