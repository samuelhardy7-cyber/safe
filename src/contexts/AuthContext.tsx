import React, {createContext, useCallback, useContext, useEffect, useState} from 'react';
import {
  applyActionCode,
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  updateProfile,
  verifyPasswordResetCode,
  type User,
} from 'firebase/auth';
import {auth} from '../firebase';
import {ensureUserAccountDoc, checkIsPlatformAdmin} from '../services/churchService';
import {hashAppPin, validatePasswordStrength, validateProfileInput} from '../domain/validation';
import type {UserAccount} from '../types/domain';
import {mapFirebaseAuthErrorID} from '../utils/firestoreErrors';

interface AuthActionLinkState {
  mode: 'resetPassword' | 'verifyEmail' | null;
  oobCode: string | null;
}

interface AuthContextValue {
  user: User | null;
  account: UserAccount | null;
  isPlatformAdmin: boolean;
  loading: boolean;
  pinLocked: boolean;
  actionLink: AuthActionLinkState;
  clearActionLink: () => void;
  refreshAccount: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string, displayName: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  sendVerificationEmailAgain: () => Promise<void>;
  reloadVerificationStatus: () => Promise<boolean>;
  requestPasswordReset: (email: string) => Promise<void>;
  verifyResetCode: (oobCode: string) => Promise<string>;
  completePasswordReset: (oobCode: string, newPassword: string) => Promise<void>;
  completeEmailVerificationCode: (oobCode: string) => Promise<void>;
  reauthenticateUser: (password?: string) => Promise<void>;
  changeUserPassword: (currentPassword: string | undefined, newPassword: string) => Promise<void>;
  updateAuthDisplayName: (displayName: string) => Promise<void>;
  unlockWithPin: (pin: string) => Promise<boolean>;
  lockSessionWithPin: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function parseActionLinkFromUrl(): AuthActionLinkState {
  if (typeof window === 'undefined') return {mode: null, oobCode: null};
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');
  const oobCode = params.get('oobCode');
  if ((mode === 'resetPassword' || mode === 'verifyEmail') && oobCode) {
    return {mode, oobCode};
  }
  return {mode: null, oobCode: null};
}

export const AuthProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [user, setUser] = useState<User | null>(null);
  const [account, setAccount] = useState<UserAccount | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pinLocked, setPinLocked] = useState(false);
  const [actionLink, setActionLink] = useState<AuthActionLinkState>(() => parseActionLinkFromUrl());

  const loadAccountState = useCallback(async (firebaseUser: User | null) => {
    if (!firebaseUser) {
      setAccount(null);
      setIsPlatformAdmin(false);
      setPinLocked(false);
      return;
    }

    if (!firebaseUser.emailVerified) {
      setAccount(null);
      setIsPlatformAdmin(false);
      setPinLocked(false);
      return;
    }

    try {
      const [acct, adminStatus] = await Promise.all([
        ensureUserAccountDoc(firebaseUser),
        checkIsPlatformAdmin(firebaseUser.uid),
      ]);
      setAccount(acct);
      setIsPlatformAdmin(adminStatus);
      if (acct?.pinEnabled && acct.pinHash) {
        const unlockedInSession = sessionStorage.getItem(`higayon_pin_unlocked_${firebaseUser.uid}`) === '1';
        setPinLocked(!unlockedInSession);
      } else {
        setPinLocked(false);
      }
    } catch (err) {
      console.error('Failed loading user account state:', err);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      await loadAccountState(firebaseUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [loadAccountState]);

  const refreshAccount = useCallback(async () => {
    if (!auth.currentUser) return;
    await loadAccountState(auth.currentUser);
  }, [loadAccountState]);

  const clearActionLink = useCallback(() => {
    setActionLink({mode: null, oobCode: null});
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('mode');
      url.searchParams.delete('oobCode');
      url.searchParams.delete('apiKey');
      window.history.replaceState({}, document.title, url.pathname + url.search);
    }
  }, []);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      throw new Error(mapFirebaseAuthErrorID(err));
    }
  }, []);

  const registerWithEmail = useCallback(
    async (email: string, password: string, displayName: string) => {
      const profileCheck = validateProfileInput({displayName});
      if (!profileCheck.valid) throw new Error(profileCheck.error);
      const passCheck = validatePasswordStrength(password);
      if (!passCheck.valid) throw new Error(passCheck.error);

      try {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(cred.user, {displayName: displayName.trim()});
        await sendEmailVerification(cred.user);
      } catch (err) {
        throw new Error(mapFirebaseAuthErrorID(err));
      }
    },
    [],
  );

  const loginWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({prompt: 'select_account'});
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      throw new Error(mapFirebaseAuthErrorID(err));
    }
  }, []);

  const sendVerificationEmailAgain = useCallback(async () => {
    if (!auth.currentUser) throw new Error('Tidak ada sesi pengguna aktif.');
    try {
      await sendEmailVerification(auth.currentUser);
    } catch (err) {
      throw new Error(mapFirebaseAuthErrorID(err));
    }
  }, []);

  const reloadVerificationStatus = useCallback(async () => {
    if (!auth.currentUser) return false;
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
    const updatedUser = auth.currentUser;
    setUser(updatedUser);
    await loadAccountState(updatedUser);
    return updatedUser.emailVerified;
  }, [loadAccountState]);

  const requestPasswordReset = useCallback(async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch (err) {
      throw new Error(mapFirebaseAuthErrorID(err));
    }
  }, []);

  const verifyResetCode = useCallback(async (oobCode: string) => {
    try {
      return await verifyPasswordResetCode(auth, oobCode);
    } catch (err) {
      throw new Error(mapFirebaseAuthErrorID(err));
    }
  }, []);

  const completePasswordReset = useCallback(async (oobCode: string, newPassword: string) => {
    const passCheck = validatePasswordStrength(newPassword);
    if (!passCheck.valid) throw new Error(passCheck.error);
    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
    } catch (err) {
      throw new Error(mapFirebaseAuthErrorID(err));
    }
  }, []);

  const completeEmailVerificationCode = useCallback(
    async (oobCode: string) => {
      try {
        await applyActionCode(auth, oobCode);
        if (auth.currentUser) {
          await reloadVerificationStatus();
        }
      } catch (err) {
        throw new Error(mapFirebaseAuthErrorID(err));
      }
    },
    [reloadVerificationStatus],
  );

  const reauthenticateUser = useCallback(async (password?: string) => {
    const current = auth.currentUser;
    if (!current) throw new Error('Sesi pengguna tidak ditemukan.');

    const hasPasswordProvider = current.providerData.some((p) => p.providerId === 'password');
    try {
      if (hasPasswordProvider && password) {
        if (!current.email) throw new Error('Email akun tidak tersedia.');
        const cred = EmailAuthProvider.credential(current.email, password);
        await reauthenticateWithCredential(current, cred);
      } else {
        const provider = new GoogleAuthProvider();
        await reauthenticateWithPopup(current, provider);
      }
    } catch (err) {
      throw new Error(mapFirebaseAuthErrorID(err));
    }
  }, []);

  const changeUserPassword = useCallback(
    async (currentPassword: string | undefined, newPassword: string) => {
      const current = auth.currentUser;
      if (!current) throw new Error('Sesi pengguna tidak ditemukan.');
      const passCheck = validatePasswordStrength(newPassword);
      if (!passCheck.valid) throw new Error(passCheck.error);

      await reauthenticateUser(currentPassword);
      try {
        await updatePassword(current, newPassword);
      } catch (err) {
        throw new Error(mapFirebaseAuthErrorID(err));
      }
    },
    [reauthenticateUser],
  );

  const updateAuthDisplayName = useCallback(async (displayName: string) => {
    const current = auth.currentUser;
    if (!current) throw new Error('Sesi pengguna tidak ditemukan.');
    await updateProfile(current, {displayName: displayName.trim()});
  }, []);

  const unlockWithPin = useCallback(
    async (pin: string) => {
      if (!user || !account?.pinHash) return false;
      const hashed = await hashAppPin(pin, user.uid);
      if (hashed === account.pinHash) {
        sessionStorage.setItem(`higayon_pin_unlocked_${user.uid}`, '1');
        setPinLocked(false);
        return true;
      }
      return false;
    },
    [user, account],
  );

  const lockSessionWithPin = useCallback(() => {
    if (user && account?.pinEnabled) {
      sessionStorage.removeItem(`higayon_pin_unlocked_${user.uid}`);
      setPinLocked(true);
    }
  }, [user, account]);

  const logout = useCallback(async () => {
    if (auth.currentUser) {
      sessionStorage.removeItem(`higayon_pin_unlocked_${auth.currentUser.uid}`);
    }
    sessionStorage.removeItem('higayon_active_church_id');
    await signOut(auth);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        account,
        isPlatformAdmin,
        loading,
        pinLocked,
        actionLink,
        clearActionLink,
        refreshAccount,
        loginWithEmail,
        registerWithEmail,
        loginWithGoogle,
        sendVerificationEmailAgain,
        reloadVerificationStatus,
        requestPasswordReset,
        verifyResetCode,
        completePasswordReset,
        completeEmailVerificationCode,
        reauthenticateUser,
        changeUserPassword,
        updateAuthDisplayName,
        unlockWithPin,
        lockSessionWithPin,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus digunakan di dalam AuthProvider.');
  return ctx;
}
