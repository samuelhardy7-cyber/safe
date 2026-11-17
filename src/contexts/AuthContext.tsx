import React, {createContext, useCallback, useContext, useEffect, useRef, useState} from 'react';
import {
  applyActionCode,
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updatePassword,
  updateProfile,
  verifyPasswordResetCode,
  type ActionCodeSettings,
  type User,
} from 'firebase/auth';
import {auth} from '../firebase';
import {
  buildAuthContinueUrl,
  classifyHostingEnvironment,
  mapFirebaseAuthErrorDetails,
  shouldPreferGoogleRedirect,
  validateEmailAddressFormat,
  type AuthDiagnosticEvent,
  type ProviderVerificationStatus,
} from '../domain/authDiagnostics';
import {ensureUserAccountDoc, checkIsPlatformAdmin} from '../services/churchService';
import {hashAppPin, validatePasswordStrength, validateProfileInput} from '../domain/validation';
import type {UserAccount} from '../types/domain';

interface AuthActionLinkState {
  mode: 'resetPassword' | 'verifyEmail' | null;
  oobCode: string | null;
}

export interface ProviderObservationState {
  emailPassword: ProviderVerificationStatus;
  google: ProviderVerificationStatus;
}

interface AuthContextValue {
  user: User | null;
  account: UserAccount | null;
  isPlatformAdmin: boolean;
  loading: boolean;
  pinLocked: boolean;
  actionLink: AuthActionLinkState;
  lastAuthDiagnostic: AuthDiagnosticEvent | null;
  redirectAuthError: string | null;
  providerStatus: ProviderObservationState;
  clearActionLink: () => void;
  clearRedirectAuthError: () => void;
  refreshAccount: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string, displayName: string) => Promise<void>;
  loginWithGoogle: (options?: {useRedirect?: boolean}) => Promise<void>;
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
const REDIRECT_PENDING_KEY = 'higayon_google_redirect_pending';

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

function getSafeActionCodeSettings(): ActionCodeSettings | undefined {
  if (typeof window === 'undefined') return undefined;
  const continueUrl = buildAuthContinueUrl(window.location.origin);
  if (!continueUrl) return undefined;
  return {
    url: continueUrl,
    handleCodeInApp: true,
  };
}

function getCurrentHostname(): string {
  return typeof window !== 'undefined' ? window.location.hostname : '';
}

export const AuthProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [user, setUser] = useState<User | null>(null);
  const [account, setAccount] = useState<UserAccount | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pinLocked, setPinLocked] = useState(false);
  const [actionLink, setActionLink] = useState<AuthActionLinkState>(() => parseActionLinkFromUrl());
  const [lastAuthDiagnostic, setLastAuthDiagnostic] = useState<AuthDiagnosticEvent | null>(null);
  const [redirectAuthError, setRedirectAuthError] = useState<string | null>(null);
  const [providerStatus, setProviderStatus] = useState<ProviderObservationState>({
    emailPassword: 'unverified',
    google: 'unverified',
  });
  const redirectCheckedRef = useRef(false);

  const recordDiagnosticFailure = useCallback(
    (action: AuthDiagnosticEvent['action'], error: unknown): string => {
      const hostname = getCurrentHostname();
      const details = mapFirebaseAuthErrorDetails(error, hostname);
      setLastAuthDiagnostic({
        code: details.code,
        action,
        hostname,
        environment: classifyHostingEnvironment(hostname),
        messageSummary: details.safeTechnicalSummary,
        timestampIso: new Date().toISOString(),
        isDomainError: details.isDomainError,
        isPopupBlocked: details.isPopupBlocked,
      });

      if (action === 'login_email' || action === 'register_email' || action === 'password_reset') {
        if (details.isProviderDisabled) {
          setProviderStatus((prev) => ({...prev, emailPassword: 'disabled_in_console'}));
        } else if (
          [
            'auth/invalid-credential',
            'auth/wrong-password',
            'auth/user-not-found',
            'auth/email-already-in-use',
          ].includes(details.code)
        ) {
          setProviderStatus((prev) => ({...prev, emailPassword: 'observed_active'}));
        }
      }

      if (
        action === 'login_google_popup' ||
        action === 'login_google_redirect' ||
        action === 'redirect_result'
      ) {
        if (details.isProviderDisabled) {
          setProviderStatus((prev) => ({...prev, google: 'disabled_in_console'}));
        } else if (details.isDomainError) {
          setProviderStatus((prev) => ({...prev, google: 'domain_unauthorized'}));
        } else if (details.isPopupClosed || details.isPopupBlocked) {
          setProviderStatus((prev) =>
            prev.google === 'unverified' ? {...prev, google: 'observed_active'} : prev,
          );
        }
      }

      return details.userMessage;
    },
    [],
  );

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
        const unlockedInSession =
          sessionStorage.getItem(`higayon_pin_unlocked_${firebaseUser.uid}`) === '1';
        setPinLocked(!unlockedInSession);
      } else {
        setPinLocked(false);
      }
    } catch (err) {
      console.error('Failed loading user account state:', err);
    }
  }, []);

  useEffect(() => {
    // Handle OAuth redirect return once without creating a redirect loop
    if (!redirectCheckedRef.current) {
      redirectCheckedRef.current = true;
      const hadPendingRedirect =
        typeof window !== 'undefined' && Boolean(sessionStorage.getItem(REDIRECT_PENDING_KEY));
      void getRedirectResult(auth)
        .then((result) => {
          if (typeof window !== 'undefined') {
            sessionStorage.removeItem(REDIRECT_PENDING_KEY);
          }
          if (result?.user) {
            setProviderStatus((prev) => ({...prev, google: 'observed_active'}));
            setLastAuthDiagnostic(null);
            setRedirectAuthError(null);
          }
        })
        .catch((err) => {
          if (typeof window !== 'undefined') {
            sessionStorage.removeItem(REDIRECT_PENDING_KEY);
          }
          if (hadPendingRedirect) {
            const friendly = recordDiagnosticFailure('redirect_result', err);
            setRedirectAuthError(friendly);
          }
        });
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const hasPassword = firebaseUser.providerData.some((p) => p.providerId === 'password');
        const hasGoogle = firebaseUser.providerData.some((p) => p.providerId === 'google.com');
        if (hasPassword || hasGoogle) {
          setProviderStatus((prev) => ({
            emailPassword: hasPassword ? 'observed_active' : prev.emailPassword,
            google: hasGoogle ? 'observed_active' : prev.google,
          }));
        }
      }
      await loadAccountState(firebaseUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [loadAccountState, recordDiagnosticFailure]);

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
      url.searchParams.delete('lang');
      url.searchParams.delete('continueUrl');
      window.history.replaceState({}, document.title, url.pathname + url.search);
    }
  }, []);

  const clearRedirectAuthError = useCallback(() => {
    setRedirectAuthError(null);
  }, []);

  const loginWithEmail = useCallback(
    async (email: string, password: string) => {
      const emailCheck = validateEmailAddressFormat(email);
      if (!emailCheck.valid) throw new Error(emailCheck.error);
      if (!password) throw new Error('Masukkan kata sandi Anda.');

      try {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        setProviderStatus((prev) => ({...prev, emailPassword: 'observed_active'}));
        setLastAuthDiagnostic(null);
      } catch (err) {
        throw new Error(recordDiagnosticFailure('login_email', err));
      }
    },
    [recordDiagnosticFailure],
  );

  const sendVerificationWithSafeContinueUrl = useCallback(
    async (targetUser: User) => {
      const actionSettings = getSafeActionCodeSettings();
      try {
        if (actionSettings) {
          await sendEmailVerification(targetUser, actionSettings);
        } else {
          await sendEmailVerification(targetUser);
        }
      } catch (err) {
        const details = mapFirebaseAuthErrorDetails(err, getCurrentHostname());
        if (details.isContinueUriError) {
          recordDiagnosticFailure('email_verification', err);
          await sendEmailVerification(targetUser);
          return;
        }
        throw err;
      }
    },
    [recordDiagnosticFailure],
  );

  const registerWithEmail = useCallback(
    async (email: string, password: string, displayName: string) => {
      const profileCheck = validateProfileInput({displayName});
      if (!profileCheck.valid) throw new Error(profileCheck.error);
      const emailCheck = validateEmailAddressFormat(email);
      if (!emailCheck.valid) throw new Error(emailCheck.error);
      const passCheck = validatePasswordStrength(password);
      if (!passCheck.valid) throw new Error(passCheck.error);

      try {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(cred.user, {displayName: displayName.trim()});
        await sendVerificationWithSafeContinueUrl(cred.user);
        setProviderStatus((prev) => ({...prev, emailPassword: 'observed_active'}));
        setLastAuthDiagnostic(null);
      } catch (err) {
        throw new Error(recordDiagnosticFailure('register_email', err));
      }
    },
    [recordDiagnosticFailure, sendVerificationWithSafeContinueUrl],
  );

  const loginWithGoogle = useCallback(
    async (options?: {useRedirect?: boolean}) => {
      setRedirectAuthError(null);
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({prompt: 'select_account'});

      const isStandalone =
        typeof window !== 'undefined' &&
        (window.matchMedia('(display-mode: standalone)').matches ||
          (window.navigator as unknown as {standalone?: boolean}).standalone === true);
      const ua = typeof window !== 'undefined' ? window.navigator.userAgent.toLowerCase() : '';
      const isIOS = /iphone|ipad|ipod/.test(ua);
      const isInIframe = typeof window !== 'undefined' && window.self !== window.top;

      const useRedirectFlow = shouldPreferGoogleRedirect({
        isStandalone,
        isIOS,
        isInIframe,
        forceRedirect: options?.useRedirect,
      });

      if (useRedirectFlow) {
        try {
          if (typeof window !== 'undefined') {
            sessionStorage.setItem(REDIRECT_PENDING_KEY, String(Date.now()));
          }
          await signInWithRedirect(auth, provider);
          return;
        } catch (err) {
          if (typeof window !== 'undefined') {
            sessionStorage.removeItem(REDIRECT_PENDING_KEY);
          }
          throw new Error(recordDiagnosticFailure('login_google_redirect', err));
        }
      }

      try {
        await signInWithPopup(auth, provider);
        setProviderStatus((prev) => ({...prev, google: 'observed_active'}));
        setLastAuthDiagnostic(null);
      } catch (err) {
        throw new Error(recordDiagnosticFailure('login_google_popup', err));
      }
    },
    [recordDiagnosticFailure],
  );

  const sendVerificationEmailAgain = useCallback(async () => {
    if (!auth.currentUser) throw new Error('Tidak ada sesi pengguna aktif.');
    try {
      await sendVerificationWithSafeContinueUrl(auth.currentUser);
    } catch (err) {
      throw new Error(recordDiagnosticFailure('email_verification', err));
    }
  }, [recordDiagnosticFailure, sendVerificationWithSafeContinueUrl]);

  const reloadVerificationStatus = useCallback(async () => {
    if (!auth.currentUser) return false;
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
    const updatedUser = auth.currentUser;
    setUser(updatedUser);
    await loadAccountState(updatedUser);
    return updatedUser.emailVerified;
  }, [loadAccountState]);

  const requestPasswordReset = useCallback(
    async (email: string) => {
      const emailCheck = validateEmailAddressFormat(email);
      if (!emailCheck.valid) {
        throw new Error(emailCheck.error);
      }

      const trimmedEmail = email.trim();
      const actionSettings = getSafeActionCodeSettings();
      try {
        if (actionSettings) {
          await sendPasswordResetEmail(auth, trimmedEmail, actionSettings);
        } else {
          await sendPasswordResetEmail(auth, trimmedEmail);
        }
        setLastAuthDiagnostic(null);
      } catch (err) {
        const details = mapFirebaseAuthErrorDetails(err, getCurrentHostname());
        if (details.isContinueUriError) {
          recordDiagnosticFailure('password_reset', err);
          try {
            await sendPasswordResetEmail(auth, trimmedEmail);
            return;
          } catch (fallbackErr) {
            throw new Error(recordDiagnosticFailure('password_reset', fallbackErr));
          }
        }
        throw new Error(recordDiagnosticFailure('password_reset', err));
      }
    },
    [recordDiagnosticFailure],
  );

  const verifyResetCode = useCallback(
    async (oobCode: string) => {
      try {
        return await verifyPasswordResetCode(auth, oobCode);
      } catch (err) {
        throw new Error(recordDiagnosticFailure('password_reset', err));
      }
    },
    [recordDiagnosticFailure],
  );

  const completePasswordReset = useCallback(
    async (oobCode: string, newPassword: string) => {
      const passCheck = validatePasswordStrength(newPassword);
      if (!passCheck.valid) throw new Error(passCheck.error);
      try {
        await confirmPasswordReset(auth, oobCode, newPassword);
      } catch (err) {
        throw new Error(recordDiagnosticFailure('password_reset', err));
      }
    },
    [recordDiagnosticFailure],
  );

  const completeEmailVerificationCode = useCallback(
    async (oobCode: string) => {
      try {
        await applyActionCode(auth, oobCode);
        if (auth.currentUser) {
          await reloadVerificationStatus();
        }
      } catch (err) {
        throw new Error(recordDiagnosticFailure('email_verification', err));
      }
    },
    [recordDiagnosticFailure, reloadVerificationStatus],
  );

  const reauthenticateUser = useCallback(
    async (password?: string) => {
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
        throw new Error(recordDiagnosticFailure('reauth', err));
      }
    },
    [recordDiagnosticFailure],
  );

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
        throw new Error(recordDiagnosticFailure('reauth', err));
      }
    },
    [reauthenticateUser, recordDiagnosticFailure],
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
    sessionStorage.removeItem(REDIRECT_PENDING_KEY);
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
        lastAuthDiagnostic,
        redirectAuthError,
        providerStatus,
        clearActionLink,
        clearRedirectAuthError,
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
