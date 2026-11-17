import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import type {User} from 'firebase/auth';
import {getBytes, ref, uploadBytes} from 'firebase/storage';
import {getFunctions, httpsCallable} from 'firebase/functions';
import {db, firebaseApp, storage} from '../firebase';
import {
  buildSignedBackupArchive,
  summarizeBackupArchive,
  validateBackupArchiveObject,
  validateOwnershipTransferCandidate,
  type ChurchBackupArchive,
} from '../domain/backup';
import {assertBrowserOnline} from '../utils/networkGuard';
import {
  assertTenantContext,
  canManageMember,
  sanitizeRolePermissions,
} from '../domain/rbac';
import {
  isValidFirestoreId,
  sanitizeSlugId,
  validateChurchInput,
  validateInvitationInput,
  validateProfileInput,
} from '../domain/validation';
import type {
  AuditLogEntry,
  BackupRecord,
  Church,
  ChurchInvitation,
  ChurchMembership,
  ChurchRole,
  ChurchSettings,
  CurrencyCode,
  FinancePermission,
  LanguageCode,
  LocaleCode,
  MembershipStatus,
  OwnershipTransferRequest,
  StaffPermission,
  UserAccount,
  UserChurchRef,
} from '../types/domain';
import {handleFirestoreError, OperationType} from '../utils/firestoreErrors';
import {syncFinanceViewerUids} from './financeService';

function generateSecureId(prefix: string): string {
  const rand =
    typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 14)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}-${rand}`;
}

export async function ensureUserAccountDoc(user: User): Promise<UserAccount | null> {
  if (!user.emailVerified) return null;
  const userPath = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data() as UserAccount;
    }
    const payload: UserAccount = {
      uid: user.uid,
      email: (user.email || '').toLowerCase(),
      displayName: (user.displayName || user.email?.split('@')[0] || 'Pengguna').slice(0, 120),
      phone: user.phoneNumber || '',
      photoURL: user.photoURL || '',
      locale: 'id-ID',
      pinEnabled: false,
      mfaAcknowledged: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref, payload);
    return payload;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }
}

export async function updateUserProfile(
  uid: string,
  input: {displayName: string; phone?: string; locale: LocaleCode; defaultChurchId?: string},
): Promise<void> {
  assertBrowserOnline('Pembaruan profil akun');
  const validation = validateProfileInput({displayName: input.displayName, phone: input.phone});
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  const userPath = `users/${uid}`;
  try {
    const updateData: Record<string, unknown> = {
      displayName: input.displayName.trim(),
      phone: (input.phone || '').trim(),
      locale: input.locale,
      updatedAt: serverTimestamp(),
    };
    if (input.defaultChurchId !== undefined) {
      updateData.defaultChurchId = input.defaultChurchId;
    }
    await updateDoc(doc(db, 'users', uid), updateData);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, userPath);
  }
}

export async function updateUserPinSecurity(
  uid: string,
  pinEnabled: boolean,
  pinHash: string,
): Promise<void> {
  assertBrowserOnline('Pembaruan keamanan PIN');
  const userPath = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      pinEnabled,
      pinHash: pinEnabled ? pinHash : '',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, userPath);
  }
}

export async function updateUserMfaAcknowledgement(
  uid: string,
  mfaAcknowledged: boolean,
): Promise<void> {
  assertBrowserOnline('Pembaruan status MFA');
  const userPath = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      mfaAcknowledged,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, userPath);
  }
}

export function subscribeUserChurchRefs(
  uid: string,
  onData: (refs: UserChurchRef[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  const path = `userChurchRefs/${uid}/churches`;
  const q = query(collection(db, 'userChurchRefs', uid, 'churches'));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => d.data() as UserChurchRef);
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    },
  );
}

export function subscribePendingInvitationsForEmail(
  email: string,
  onData: (invites: ChurchInvitation[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  const path = 'churchInvitations';
  const q = query(
    collection(db, 'churchInvitations'),
    where('invitedEmail', '==', email.toLowerCase()),
    where('status', '==', 'pending'),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => d.data() as ChurchInvitation);
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    },
  );
}

export async function loadActiveChurchContext(
  uid: string,
  churchId: string,
): Promise<{
  church: Church;
  settings: ChurchSettings | null;
  membership: ChurchMembership;
}> {
  if (!isValidFirestoreId(churchId, 3, 128)) {
    throw new Error('ID Gereja tidak valid.');
  }

  const membershipPath = `churches/${churchId}/memberships/${uid}`;
  const churchPath = `churches/${churchId}`;
  const settingsPath = `churches/${churchId}/settings/general`;

  let membershipSnap;
  try {
    membershipSnap = await getDoc(doc(db, 'churches', churchId, 'memberships', uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, membershipPath);
  }

  if (!membershipSnap.exists()) {
    throw new Error('Keanggotaan Anda pada gereja ini tidak ditemukan.');
  }

  const membership = membershipSnap.data() as ChurchMembership;
  if (membership.status !== 'active') {
    throw new Error('Keanggotaan Anda pada gereja ini tidak aktif atau telah dicabut.');
  }

  let churchSnap;
  try {
    churchSnap = await getDoc(doc(db, 'churches', churchId));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, churchPath);
  }

  if (!churchSnap.exists()) {
    throw new Error('Data gereja tidak ditemukan.');
  }

  let settings: ChurchSettings | null = null;
  try {
    const settingsSnap = await getDoc(doc(db, 'churches', churchId, 'settings', 'general'));
    if (settingsSnap.exists()) {
      settings = settingsSnap.data() as ChurchSettings;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, settingsPath);
  }

  return {
    church: churchSnap.data() as Church,
    settings,
    membership,
  };
}

export async function createChurchWorkspace(
  user: User,
  account: UserAccount,
  input: {
    name: string;
    denomination?: string;
    city: string;
    country: string;
    timezone: string;
    currency: CurrencyCode;
    language: LanguageCode;
  },
): Promise<string> {
  assertBrowserOnline('Pembuatan ruang kerja gereja baru');
  if (!user.emailVerified) {
    throw new Error('Email harus diverifikasi terlebih dahulu sebelum membuat gereja.');
  }
  const validation = validateChurchInput(input);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const slug = sanitizeSlugId(input.name);
  const suffix = Math.random().toString(36).slice(2, 7);
  const churchId = `${slug}-${suffix}`.slice(0, 80);
  const logId = generateSecureId('log');

  const batch = writeBatch(db);
  const churchRef = doc(db, 'churches', churchId);
  const membershipRef = doc(db, 'churches', churchId, 'memberships', user.uid);
  const userChurchRef = doc(db, 'userChurchRefs', user.uid, 'churches', churchId);
  const settingsRef = doc(db, 'churches', churchId, 'settings', 'general');
  const auditRef = doc(db, 'churches', churchId, 'auditLogs', logId);

  const now = serverTimestamp();

  batch.set(churchRef, {
    id: churchId,
    name: input.name.trim(),
    denomination: (input.denomination || '').trim(),
    city: input.city.trim(),
    country: input.country.trim(),
    timezone: input.timezone || 'Asia/Jakarta',
    currency: input.currency || 'IDR',
    language: input.language || 'id',
    ownerId: user.uid,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });

  batch.set(membershipRef, {
    uid: user.uid,
    churchId,
    ownerUid: user.uid,
    displayName: account.displayName || user.displayName || 'Church Owner',
    email: (user.email || '').toLowerCase(),
    role: 'owner',
    status: 'active',
    financePermissions: [],
    staffPermissions: [],
    invitedBy: user.uid,
    createdAt: now,
    updatedAt: now,
  });

  batch.set(userChurchRef, {
    uid: user.uid,
    churchId,
    churchName: input.name.trim(),
    role: 'owner',
    status: 'active',
    joinedAt: now,
    updatedAt: now,
  });

  batch.set(settingsRef, {
    churchId,
    ownerUid: user.uid,
    address: '',
    contactEmail: (user.email || '').toLowerCase(),
    contactPhone: '',
    fiscalYearStartMonth: 1,
    requireMfaForFinanceApproval: true,
    requirePinForSensitiveActions: false,
    sessionTimeoutMinutes: 30,
    automatedBackupEnabled: false,
    updatedBy: user.uid,
    updatedAt: now,
  });

  batch.set(auditRef, {
    id: logId,
    churchId,
    ownerUid: user.uid,
    actorUid: user.uid,
    actorEmail: (user.email || '').toLowerCase(),
    actorRole: 'owner',
    action: 'church.created',
    targetType: 'church',
    targetId: churchId,
    summary: `Ruang kerja gereja "${input.name.trim()}" dibuat dengan isolasi tenant penuh.`,
    createdAt: now,
  });

  try {
    await batch.commit();
    return churchId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `churches/${churchId}`);
  }
}

export async function updateChurchConfiguration(
  activeChurchId: string,
  membership: ChurchMembership,
  churchUpdates: {
    name: string;
    denomination?: string;
    city: string;
    country: string;
    timezone: string;
    currency: CurrencyCode;
    language: LanguageCode;
  },
  settingsUpdates: {
    address?: string;
    contactEmail?: string;
    contactPhone?: string;
    fiscalYearStartMonth: number;
    requireMfaForFinanceApproval: boolean;
    requirePinForSensitiveActions: boolean;
    sessionTimeoutMinutes: number;
    automatedBackupEnabled?: boolean;
  },
): Promise<void> {
  assertBrowserOnline('Pembaruan pengaturan gereja');
  assertTenantContext(activeChurchId, activeChurchId, membership);
  if (membership.role !== 'owner') {
    throw new Error('Hanya Church Owner yang dapat mengubah pengaturan gereja.');
  }

  const validation = validateChurchInput(churchUpdates);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const logId = generateSecureId('log');
  const batch = writeBatch(db);
  const now = serverTimestamp();

  batch.update(doc(db, 'churches', activeChurchId), {
    name: churchUpdates.name.trim(),
    denomination: (churchUpdates.denomination || '').trim(),
    city: churchUpdates.city.trim(),
    country: churchUpdates.country.trim(),
    timezone: churchUpdates.timezone,
    currency: churchUpdates.currency,
    language: churchUpdates.language,
    updatedAt: now,
  });

  batch.update(doc(db, 'userChurchRefs', membership.uid, 'churches', activeChurchId), {
    churchName: churchUpdates.name.trim(),
    updatedAt: now,
  });

  batch.update(doc(db, 'churches', activeChurchId, 'settings', 'general'), {
    address: (settingsUpdates.address || '').trim(),
    contactEmail: (settingsUpdates.contactEmail || '').trim(),
    contactPhone: (settingsUpdates.contactPhone || '').trim(),
    fiscalYearStartMonth: Number(settingsUpdates.fiscalYearStartMonth),
    requireMfaForFinanceApproval: Boolean(settingsUpdates.requireMfaForFinanceApproval),
    requirePinForSensitiveActions: Boolean(settingsUpdates.requirePinForSensitiveActions),
    sessionTimeoutMinutes: Number(settingsUpdates.sessionTimeoutMinutes),
    automatedBackupEnabled: Boolean(settingsUpdates.automatedBackupEnabled),
    updatedBy: membership.uid,
    updatedAt: now,
  });

  batch.set(doc(db, 'churches', activeChurchId, 'auditLogs', logId), {
    id: logId,
    churchId: activeChurchId,
    ownerUid: membership.ownerUid,
    actorUid: membership.uid,
    actorEmail: membership.email,
    actorRole: membership.role,
    action: 'church.settings_updated',
    targetType: 'settings',
    targetId: 'general',
    summary: `Profil & kebijakan keamanan gereja "${churchUpdates.name.trim()}" diperbarui.`,
    createdAt: now,
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `churches/${activeChurchId}`);
  }
}

export async function fetchChurchMembers(
  activeChurchId: string,
  membership: ChurchMembership,
): Promise<ChurchMembership[]> {
  assertTenantContext(activeChurchId, activeChurchId, membership);
  if (membership.role !== 'owner') {
    throw new Error('Hanya Church Owner yang dapat melihat daftar seluruh pengguna gereja.');
  }

  const path = `churches/${activeChurchId}/memberships`;
  try {
    const q = query(
      collection(db, 'churches', activeChurchId, 'memberships'),
      where('ownerUid', '==', membership.ownerUid),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as ChurchMembership);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchChurchInvitations(
  activeChurchId: string,
  membership: ChurchMembership,
): Promise<ChurchInvitation[]> {
  assertTenantContext(activeChurchId, activeChurchId, membership);
  if (membership.role !== 'owner') {
    throw new Error('Hanya Church Owner yang dapat melihat daftar undangan.');
  }

  const path = 'churchInvitations';
  try {
    const q = query(
      collection(db, 'churchInvitations'),
      where('ownerUid', '==', membership.ownerUid),
      where('churchId', '==', activeChurchId),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as ChurchInvitation);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function createChurchInvitation(
  activeChurchId: string,
  churchName: string,
  membership: ChurchMembership,
  input: {
    invitedEmail: string;
    role: Exclude<ChurchRole, 'owner'>;
    financePermissions: FinancePermission[];
    staffPermissions: StaffPermission[];
  },
): Promise<ChurchInvitation> {
  assertBrowserOnline('Pengiriman undangan pengguna');
  assertTenantContext(activeChurchId, activeChurchId, membership);
  if (membership.role !== 'owner') {
    throw new Error('Hanya Church Owner yang berhak mengundang pengguna.');
  }

  const validation = validateInvitationInput({
    email: input.invitedEmail,
    role: input.role,
    financePermissions: input.financePermissions,
  });
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const cleanPerms = sanitizeRolePermissions(
    input.role,
    input.financePermissions,
    input.staffPermissions,
  );

  const inviteId = generateSecureId('inv');
  const logId = generateSecureId('log');
  const expiresAt = Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  const now = serverTimestamp();

  const invitationPayload: ChurchInvitation = {
    id: inviteId,
    churchId: activeChurchId,
    churchName,
    ownerUid: membership.ownerUid,
    invitedEmail: input.invitedEmail.trim().toLowerCase(),
    role: input.role,
    financePermissions: cleanPerms.financePermissions,
    staffPermissions: cleanPerms.staffPermissions,
    status: 'pending',
    invitedBy: membership.uid,
    createdAt: now,
    expiresAt,
  };

  const batch = writeBatch(db);
  batch.set(doc(db, 'churchInvitations', inviteId), invitationPayload);
  batch.set(doc(db, 'churches', activeChurchId, 'auditLogs', logId), {
    id: logId,
    churchId: activeChurchId,
    ownerUid: membership.ownerUid,
    actorUid: membership.uid,
    actorEmail: membership.email,
    actorRole: membership.role,
    action: 'invitation.created',
    targetType: 'invitation',
    targetId: inviteId,
    summary: `Undangan dikirim ke ${invitationPayload.invitedEmail} dengan peran ${input.role}.`,
    createdAt: now,
  });

  try {
    await batch.commit();
    return invitationPayload;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `churchInvitations/${inviteId}`);
  }
}

export async function revokeChurchInvitation(
  activeChurchId: string,
  membership: ChurchMembership,
  invite: ChurchInvitation,
): Promise<void> {
  assertBrowserOnline('Pencabutan undangan pengguna');
  assertTenantContext(activeChurchId, invite.churchId, membership);
  if (membership.role !== 'owner') {
    throw new Error('Hanya Church Owner yang dapat membatalkan undangan.');
  }

  const logId = generateSecureId('log');
  const batch = writeBatch(db);
  batch.update(doc(db, 'churchInvitations', invite.id), {
    status: 'revoked',
  });
  batch.set(doc(db, 'churches', activeChurchId, 'auditLogs', logId), {
    id: logId,
    churchId: activeChurchId,
    ownerUid: membership.ownerUid,
    actorUid: membership.uid,
    actorEmail: membership.email,
    actorRole: membership.role,
    action: 'invitation.revoked',
    targetType: 'invitation',
    targetId: invite.id,
    summary: `Undangan untuk ${invite.invitedEmail} dicabut sebelum digunakan.`,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `churchInvitations/${invite.id}`);
  }
}

export async function acceptChurchInvitation(
  user: User,
  account: UserAccount,
  invite: ChurchInvitation,
): Promise<void> {
  assertBrowserOnline('Penerimaan undangan gereja');
  if (!user.emailVerified || !user.email) {
    throw new Error('Email harus diverifikasi terlebih dahulu untuk menerima undangan.');
  }
  if (user.email.toLowerCase() !== invite.invitedEmail.toLowerCase()) {
    throw new Error('Undangan ini ditujukan untuk alamat email yang berbeda.');
  }

  const cleanPerms = sanitizeRolePermissions(
    invite.role,
    invite.financePermissions,
    invite.staffPermissions,
  );
  const logId = generateSecureId('log');
  const now = serverTimestamp();

  const batch = writeBatch(db);

  batch.update(doc(db, 'churchInvitations', invite.id), {
    status: 'accepted',
    acceptedByUid: user.uid,
    acceptedAt: now,
  });

  batch.set(doc(db, 'churches', invite.churchId, 'memberships', user.uid), {
    uid: user.uid,
    churchId: invite.churchId,
    ownerUid: invite.ownerUid,
    displayName: account.displayName || user.displayName || 'Anggota Tim',
    email: user.email.toLowerCase(),
    role: invite.role,
    status: 'active',
    financePermissions: cleanPerms.financePermissions,
    staffPermissions: cleanPerms.staffPermissions,
    invitedBy: invite.id,
    createdAt: now,
    updatedAt: now,
  });

  batch.set(doc(db, 'userChurchRefs', user.uid, 'churches', invite.churchId), {
    uid: user.uid,
    churchId: invite.churchId,
    churchName: invite.churchName,
    role: invite.role,
    status: 'active',
    joinedAt: now,
    updatedAt: now,
  });

  batch.set(doc(db, 'churches', invite.churchId, 'auditLogs', logId), {
    id: logId,
    churchId: invite.churchId,
    ownerUid: invite.ownerUid,
    actorUid: user.uid,
    actorEmail: user.email.toLowerCase(),
    actorRole: invite.role,
    action: 'invitation.accepted',
    targetType: 'membership',
    targetId: user.uid,
    summary: `${user.email.toLowerCase()} menerima undangan sebagai ${invite.role}.`,
    createdAt: now,
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `churchInvitations/${invite.id}`);
  }
}

export async function updateMemberRoleAndPermissions(
  activeChurchId: string,
  actorMembership: ChurchMembership,
  targetMembership: ChurchMembership,
  updates: {
    role: Exclude<ChurchRole, 'owner'>;
    status: MembershipStatus;
    financePermissions: FinancePermission[];
    staffPermissions: StaffPermission[];
  },
): Promise<void> {
  assertBrowserOnline('Pembaruan peran & izin pengguna');
  assertTenantContext(activeChurchId, targetMembership.churchId, actorMembership);
  if (!canManageMember(actorMembership, targetMembership)) {
    throw new Error('Anda tidak memiliki otoritas untuk mengubah akses pengguna ini.');
  }

  const cleanPerms = sanitizeRolePermissions(
    updates.role,
    updates.financePermissions,
    updates.staffPermissions,
  );
  const logId = generateSecureId('log');
  const now = serverTimestamp();

  const batch = writeBatch(db);
  batch.update(doc(db, 'churches', activeChurchId, 'memberships', targetMembership.uid), {
    role: updates.role,
    status: updates.status,
    financePermissions: updates.status === 'revoked' ? [] : cleanPerms.financePermissions,
    staffPermissions: updates.status === 'revoked' ? [] : cleanPerms.staffPermissions,
    updatedAt: now,
  });

  batch.update(doc(db, 'userChurchRefs', targetMembership.uid, 'churches', activeChurchId), {
    role: updates.role,
    status: updates.status,
    updatedAt: now,
  });

  batch.set(doc(db, 'churches', activeChurchId, 'auditLogs', logId), {
    id: logId,
    churchId: activeChurchId,
    ownerUid: actorMembership.ownerUid,
    actorUid: actorMembership.uid,
    actorEmail: actorMembership.email,
    actorRole: actorMembership.role,
    action: updates.status === 'revoked' ? 'membership.revoked' : 'membership.updated',
    targetType: 'membership',
    targetId: targetMembership.uid,
    summary: `Akses ${targetMembership.email} diperbarui: peran=${updates.role}, status=${updates.status}.`,
    createdAt: now,
  });

  try {
    await batch.commit();
    await syncFinanceViewerUids(activeChurchId, actorMembership).catch((syncErr) => {
      console.warn('Finance viewer sync warning:', syncErr);
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `churches/${activeChurchId}/memberships/${targetMembership.uid}`,
    );
  }
}

export async function fetchChurchAuditLogs(
  activeChurchId: string,
  membership: ChurchMembership,
): Promise<AuditLogEntry[]> {
  assertTenantContext(activeChurchId, activeChurchId, membership);
  if (membership.role !== 'owner') {
    throw new Error('Hanya Church Owner yang dapat melihat seluruh audit log gereja.');
  }

  const path = `churches/${activeChurchId}/auditLogs`;
  try {
    const q = query(
      collection(db, 'churches', activeChurchId, 'auditLogs'),
      where('ownerUid', '==', membership.ownerUid),
      orderBy('createdAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as AuditLogEntry);
  } catch (error) {
    // Fallback without orderBy if composite index isn't built yet
    try {
      const qFallback = query(
        collection(db, 'churches', activeChurchId, 'auditLogs'),
        where('ownerUid', '==', membership.ownerUid),
      );
      const snap = await getDocs(qFallback);
      const items = snap.docs.map((d) => d.data() as AuditLogEntry);
      return items.sort((a, b) => {
        const aSec = (a.createdAt as {seconds?: number})?.seconds || 0;
        const bSec = (b.createdAt as {seconds?: number})?.seconds || 0;
        return bSec - aSec;
      });
    } catch (fallbackErr) {
      handleFirestoreError(fallbackErr, OperationType.LIST, path);
    }
  }
}

function sanitizeArchiveDocForJson(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && 'seconds' in v && 'nanoseconds' in v) {
      const ts = v as {seconds: number; nanoseconds: number};
      out[k] = {_firestoreTs: true, seconds: ts.seconds, nanoseconds: ts.nanoseconds};
    } else if (v instanceof Date) {
      out[k] = v.toISOString();
    } else {
      out[k] = v;
    }
  }
  return out;
}

export async function createChurchBackupRecord(
  activeChurchId: string,
  membership: ChurchMembership,
  church: Church,
  settings: ChurchSettings | null,
  scope: BackupRecord['scope'],
  backupType: 'manual' | 'pre_restore' = 'manual',
  restoredFromBackupId?: string,
): Promise<{record: BackupRecord; exportPayload: string; storageUploaded: boolean}> {
  assertBrowserOnline('Pembuatan arsip backup gereja');
  assertTenantContext(activeChurchId, activeChurchId, membership);
  if (membership.role !== 'owner') {
    throw new Error('Hanya Church Owner yang berhak membuat backup lengkap gereja.');
  }

  const readCol = async (colName: string): Promise<Record<string, unknown>[]> => {
    const snap = await getDocs(
      query(collection(db, 'churches', activeChurchId, colName), where('ownerUid', '==', membership.ownerUid)),
    );
    return snap.docs.map((d) => sanitizeArchiveDocForJson(d.data() as Record<string, unknown>));
  };

  const includeMembersAndConfig = scope !== 'finance_only';
  const includeFullData = scope === 'full';
  const includeFinance = scope === 'full' || scope === 'finance_only';

  const [
    memberships,
    auditLogs,
    congMembers,
    familyGroups,
    congActivities,
    finAccounts,
    finCategories,
    finTransactions,
    finSettings,
    finAuditLogs,
    congSettingsSnap,
  ] = await Promise.all([
    includeMembersAndConfig ? fetchChurchMembers(activeChurchId, membership) : Promise.resolve([]),
    includeFullData ? fetchChurchAuditLogs(activeChurchId, membership) : Promise.resolve([]),
    includeFullData ? readCol('congregationMembers') : Promise.resolve([]),
    includeFullData ? readCol('familyGroups') : Promise.resolve([]),
    includeFullData ? readCol('congregationActivities') : Promise.resolve([]),
    includeFinance ? readCol('financeAccounts') : Promise.resolve([]),
    includeFinance ? readCol('financeCategories') : Promise.resolve([]),
    includeFinance ? readCol('financeTransactions') : Promise.resolve([]),
    includeFinance ? readCol('financeSettings') : Promise.resolve([]),
    includeFinance ? readCol('financeAuditLogs') : Promise.resolve([]),
    includeMembersAndConfig
      ? getDoc(doc(db, 'churches', activeChurchId, 'settings', 'congregation')).catch(() => null)
      : Promise.resolve(null),
  ]);

  const settingsList: Record<string, unknown>[] = [];
  if (settings) settingsList.push(sanitizeArchiveDocForJson(settings as unknown as Record<string, unknown>));
  if (congSettingsSnap?.exists()) {
    settingsList.push(sanitizeArchiveDocForJson(congSettingsSnap.data() as Record<string, unknown>));
  }

  const congregationPaths: string[] = [];
  for (const m of congMembers) {
    if (typeof m.photoPath === 'string' && m.photoPath) congregationPaths.push(m.photoPath);
    if (Array.isArray(m.attachments)) {
      for (const att of m.attachments) {
        if (att && typeof att === 'object' && 'storagePath' in att && typeof att.storagePath === 'string') {
          congregationPaths.push(att.storagePath);
        }
      }
    }
  }

  const financeReceiptPaths: string[] = [];
  for (const tx of finTransactions) {
    if (Array.isArray(tx.attachments)) {
      for (const att of tx.attachments) {
        if (att && typeof att === 'object' && 'storagePath' in att && typeof att.storagePath === 'string') {
          financeReceiptPaths.push(att.storagePath);
        }
      }
    }
  }

  const backupId = generateSecureId('bkp');
  const {archive, serialized: exportPayload, sizeBytes} = await buildSignedBackupArchive({
    backupId,
    churchId: activeChurchId,
    ownerUid: membership.ownerUid,
    scope,
    backupType,
    createdAtIso: new Date().toISOString(),
    createdBy: membership.uid,
    collections: {
      church: sanitizeArchiveDocForJson(church as unknown as Record<string, unknown>),
      settings: settingsList,
      memberships: memberships.map((m) => sanitizeArchiveDocForJson(m as unknown as Record<string, unknown>)),
      auditLogs: auditLogs.map((l) => sanitizeArchiveDocForJson(l as unknown as Record<string, unknown>)),
      congregationMembers: congMembers,
      familyGroups,
      congregationActivities: congActivities,
      financeAccounts: finAccounts,
      financeCategories: finCategories,
      financeTransactions: finTransactions,
      financeSettings: finSettings,
      financeAuditLogs: finAuditLogs,
    },
    attachmentManifest: {
      congregationPaths,
      financeReceiptPaths,
    },
  });

  const recordSummary = summarizeBackupArchive(archive);
  const storagePath = `churches/${activeChurchId}/backups/${backupId}.json`;
  let storageUploaded = false;

  try {
    await uploadBytes(ref(storage, storagePath), new Blob([exportPayload], {type: 'application/json'}), {
      contentType: 'application/json',
      customMetadata: {
        churchId: activeChurchId,
        ownerUid: membership.ownerUid,
        checksum: archive.checksum,
        backupType,
      },
    });
    storageUploaded = true;
  } catch (storageErr) {
    console.warn('Storage backup upload skipped or failed:', storageErr);
  }

  const logId = generateSecureId('log');
  const now = serverTimestamp();

  const record: BackupRecord = {
    id: backupId,
    churchId: activeChurchId,
    ownerUid: membership.ownerUid,
    createdBy: membership.uid,
    scope,
    backupType,
    checksum: archive.checksum,
    sizeBytes,
    ...(storageUploaded ? {storagePath} : {}),
    ...(restoredFromBackupId ? {restoredFromBackupId} : {}),
    recordSummary,
    status: 'verified',
    createdAt: now,
  };

  const batch = writeBatch(db);
  batch.set(doc(db, 'churches', activeChurchId, 'backups', backupId), record);
  batch.set(doc(db, 'churches', activeChurchId, 'auditLogs', logId), {
    id: logId,
    churchId: activeChurchId,
    ownerUid: membership.ownerUid,
    actorUid: membership.uid,
    actorEmail: membership.email,
    actorRole: membership.role,
    action: backupType === 'pre_restore' ? 'backup.pre_restore_created' : 'backup.created',
    targetType: 'backup',
    targetId: backupId,
    summary: `Backup ruang kerja (${scope}, ${backupType}) dibuat (${recordSummary.members} jemaat, ${recordSummary.transactions} transaksi) & SHA-256 terverifikasi.`,
    createdAt: now,
  });

  try {
    await batch.commit();
    return {record, exportPayload, storageUploaded};
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `churches/${activeChurchId}/backups/${backupId}`);
  }
}

export async function downloadChurchBackupArchive(
  activeChurchId: string,
  membership: ChurchMembership,
  record: BackupRecord,
): Promise<string> {
  assertBrowserOnline('Pengunduhan arsip backup');
  assertTenantContext(activeChurchId, record.churchId, membership);
  if (membership.role !== 'owner') {
    throw new Error('Hanya Church Owner yang berhak mengunduh arsip backup.');
  }
  if (!record.storagePath) {
    throw new Error(
      'Arsip ini tercatat sebelum penyimpanan arsip otomatis diaktifkan. Silakan buat backup baru.',
    );
  }

  const bytes = await getBytes(ref(storage, record.storagePath), 25 * 1024 * 1024);
  const text = new TextDecoder().decode(bytes);
  const parsed = JSON.parse(text) as unknown;
  const verification = await validateBackupArchiveObject(parsed, activeChurchId, record.checksum);
  if (!verification.valid) {
    throw new Error(verification.error || 'Verifikasi checksum arsip gagal.');
  }
  return text;
}

export interface RestoreExecutionResult {
  preRestoreBackupId: string;
  restoredCounts: {
    settings: number;
    congregationMembers: number;
    familyGroups: number;
    financeCategories: number;
    financeAccounts: number;
    financeTransactions: number;
  };
  skippedImmutableCount: number;
  verifiedBackupId: string;
}

export async function restoreChurchFromBackupArchive(
  activeChurchId: string,
  membership: ChurchMembership,
  church: Church,
  settings: ChurchSettings | null,
  rawJsonText: string,
): Promise<RestoreExecutionResult> {
  assertBrowserOnline('Pemulihan (restore) data gereja');
  assertTenantContext(activeChurchId, activeChurchId, membership);
  if (membership.role !== 'owner') {
    throw new Error('Hanya Church Owner yang berhak memulihkan data gereja.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJsonText);
  } catch {
    throw new Error('File arsip backup bukan JSON yang valid.');
  }

  const check = await validateBackupArchiveObject(parsed, activeChurchId);
  if (!check.valid || !check.archive) {
    throw new Error(check.error || 'Arsip backup gagal melewati verifikasi keamanan.');
  }
  const archive: ChurchBackupArchive = check.archive;

  // Step 1: Mandatory safety pre-restore snapshot
  const preRestore = await createChurchBackupRecord(
    activeChurchId,
    membership,
    church,
    settings,
    'full',
    'pre_restore',
    archive.backupId,
  );

  const [
    existingMembersSnap,
    existingFamiliesSnap,
    existingCatSnap,
    existingAccSnap,
    existingTxSnap,
    existingCongSettingsSnap,
    existingFinSettingsSnap,
  ] = await Promise.all([
    getDocs(
      query(
        collection(db, 'churches', activeChurchId, 'congregationMembers'),
        where('ownerUid', '==', membership.ownerUid),
      ),
    ),
    getDocs(
      query(
        collection(db, 'churches', activeChurchId, 'familyGroups'),
        where('ownerUid', '==', membership.ownerUid),
      ),
    ),
    getDocs(
      query(
        collection(db, 'churches', activeChurchId, 'financeCategories'),
        where('ownerUid', '==', membership.ownerUid),
      ),
    ),
    getDocs(
      query(
        collection(db, 'churches', activeChurchId, 'financeAccounts'),
        where('ownerUid', '==', membership.ownerUid),
      ),
    ),
    getDocs(
      query(
        collection(db, 'churches', activeChurchId, 'financeTransactions'),
        where('ownerUid', '==', membership.ownerUid),
      ),
    ),
    getDoc(doc(db, 'churches', activeChurchId, 'settings', 'congregation')).catch(() => null),
    getDoc(doc(db, 'churches', activeChurchId, 'financeSettings', 'general')).catch(() => null),
  ]);

  const existingMemberIds = new Set(existingMembersSnap.docs.map((d) => d.id));
  const existingFamilyIds = new Set(existingFamiliesSnap.docs.map((d) => d.id));
  const existingCatIds = new Set(existingCatSnap.docs.map((d) => d.id));
  const existingAccIds = new Set(existingAccSnap.docs.map((d) => d.id));
  const existingTxIds = new Set(existingTxSnap.docs.map((d) => d.id));

  let batch = writeBatch(db);
  let opCount = 0;
  const now = serverTimestamp();

  const flushBatch = async () => {
    if (opCount > 0) {
      await batch.commit();
      batch = writeBatch(db);
      opCount = 0;
    }
  };

  const enqueueOp = async () => {
    opCount++;
    if (opCount >= 350) {
      await flushBatch();
    }
  };

  const restoredCounts = {
    settings: 0,
    congregationMembers: 0,
    familyGroups: 0,
    financeCategories: 0,
    financeAccounts: 0,
    financeTransactions: 0,
  };
  let skippedImmutableCount = 0;

  // Restore general settings (safe update)
  const generalSetting = archive.collections.settings.find(
    (s) => !('congregationRequiredFields' in s) || 'fiscalYearStartMonth' in s,
  );
  if (generalSetting) {
    batch.update(doc(db, 'churches', activeChurchId, 'settings', 'general'), {
      address: String(generalSetting.address || ''),
      contactEmail: String(generalSetting.contactEmail || ''),
      contactPhone: String(generalSetting.contactPhone || ''),
      fiscalYearStartMonth: Number(generalSetting.fiscalYearStartMonth || 1),
      requireMfaForFinanceApproval: Boolean(generalSetting.requireMfaForFinanceApproval ?? true),
      requirePinForSensitiveActions: Boolean(generalSetting.requirePinForSensitiveActions ?? false),
      sessionTimeoutMinutes: Number(generalSetting.sessionTimeoutMinutes || 30),
      automatedBackupEnabled: Boolean(generalSetting.automatedBackupEnabled ?? false),
      updatedBy: membership.uid,
      updatedAt: now,
    });
    restoredCounts.settings++;
    await enqueueOp();
  }

  // Restore congregation required-fields policy (settings/congregation)
  const congSetting = archive.collections.settings.find((s) =>
    Array.isArray(s.congregationRequiredFields),
  );
  if (congSetting && Array.isArray(congSetting.congregationRequiredFields)) {
    const allowedReqFields = new Set([
      'fullName',
      'nickname',
      'gender',
      'birthDate',
      'phone',
      'email',
      'address',
      'joinedDate',
      'status',
      'familyGroupId',
    ]);
    const sanitizedFields = Array.from(
      new Set([
        'fullName',
        'status',
        ...congSetting.congregationRequiredFields
          .map((f) => String(f))
          .filter((f) => allowedReqFields.has(f)),
      ]),
    );
    const congSettingsRef = doc(db, 'churches', activeChurchId, 'settings', 'congregation');
    if (existingCongSettingsSnap?.exists()) {
      batch.update(congSettingsRef, {
        congregationRequiredFields: sanitizedFields,
        updatedBy: membership.uid,
        updatedAt: now,
      });
    } else {
      batch.set(congSettingsRef, {
        churchId: activeChurchId,
        ownerUid: membership.ownerUid,
        fiscalYearStartMonth: 1,
        requireMfaForFinanceApproval: true,
        requirePinForSensitiveActions: false,
        sessionTimeoutMinutes: 30,
        congregationRequiredFields: sanitizedFields,
        updatedBy: membership.uid,
        updatedAt: now,
      });
    }
    restoredCounts.settings++;
    await enqueueOp();
  }

  // Restore finance control settings (financeSettings/general)
  const finSetting = archive.collections.financeSettings[0];
  if (finSetting) {
    const validMethods = ['cash', 'bank_transfer', 'qris', 'debit_card', 'check', 'other'];
    const finMethod = validMethods.includes(String(finSetting.defaultPaymentMethod))
      ? String(finSetting.defaultPaymentMethod)
      : 'bank_transfer';
    const finSettingsPayload: Record<string, unknown> = {
      requireReceiptAboveAmount: Math.max(
        0,
        Math.trunc(Number(finSetting.requireReceiptAboveAmount ?? 250000)),
      ),
      allowOwnerSelfApproveOverride: Boolean(finSetting.allowOwnerSelfApproveOverride ?? false),
      autoLockOnApproval: Boolean(finSetting.autoLockOnApproval ?? true),
      defaultPaymentMethod: finMethod,
      updatedBy: membership.uid,
      updatedAt: now,
    };
    if (typeof finSetting.fiscalLockBeforeDate === 'string' && finSetting.fiscalLockBeforeDate.length <= 10) {
      finSettingsPayload.fiscalLockBeforeDate = finSetting.fiscalLockBeforeDate;
    }
    const finSettingsRef = doc(db, 'churches', activeChurchId, 'financeSettings', 'general');
    if (existingFinSettingsSnap?.exists()) {
      batch.update(finSettingsRef, finSettingsPayload);
    } else {
      batch.set(finSettingsRef, {
        churchId: activeChurchId,
        ownerUid: membership.ownerUid,
        authorizedViewerUids: [membership.ownerUid],
        ...finSettingsPayload,
      });
    }
    restoredCounts.settings++;
    await enqueueOp();
  }

  // Restore family groups first
  for (const fam of archive.collections.familyGroups) {
    const id = String(fam.id || '');
    if (!id) continue;
    const refDoc = doc(db, 'churches', activeChurchId, 'familyGroups', id);
    if (existingFamilyIds.has(id)) {
      batch.update(refDoc, {
        name: String(fam.name || 'Keluarga'),
        ...(fam.headMemberId ? {headMemberId: String(fam.headMemberId)} : {}),
        notes: String(fam.notes || ''),
        archived: Boolean(fam.archived),
        updatedBy: membership.uid,
        updatedAt: now,
      });
    } else {
      batch.set(refDoc, {
        id,
        churchId: activeChurchId,
        ownerUid: membership.ownerUid,
        familyCode: String(fam.familyCode || id.slice(0, 10)),
        name: String(fam.name || 'Keluarga'),
        ...(fam.headMemberId ? {headMemberId: String(fam.headMemberId)} : {}),
        notes: String(fam.notes || ''),
        archived: Boolean(fam.archived),
        createdBy: membership.uid,
        updatedBy: membership.uid,
        createdAt: now,
        updatedAt: now,
      });
    }
    restoredCounts.familyGroups++;
    await enqueueOp();
  }

  // Restore congregation members
  for (const mbr of archive.collections.congregationMembers) {
    const id = String(mbr.id || '');
    if (!id) continue;
    const refDoc = doc(db, 'churches', activeChurchId, 'congregationMembers', id);
    const mutableFields = {
      fullName: String(mbr.fullName || 'Jemaat'),
      nickname: String(mbr.nickname || ''),
      photoPath: String(mbr.photoPath || ''),
      gender: mbr.gender === 'L' || mbr.gender === 'P' ? mbr.gender : '',
      birthDate: String(mbr.birthDate || ''),
      phone: String(mbr.phone || ''),
      email: String(mbr.email || ''),
      address: String(mbr.address || ''),
      emergencyContactName: String(mbr.emergencyContactName || ''),
      emergencyContactPhone: String(mbr.emergencyContactPhone || ''),
      emergencyContactRelation: String(mbr.emergencyContactRelation || ''),
      joinedDate: String(mbr.joinedDate || ''),
      status: ['active', 'inactive', 'visiting', 'moved', 'deceased'].includes(String(mbr.status))
        ? String(mbr.status)
        : 'active',
      familyGroupId: String(mbr.familyGroupId || ''),
      familyGroupName: String(mbr.familyGroupName || ''),
      familyRole: String(mbr.familyRole || ''),
      donorRefCode: String(mbr.donorRefCode || ''),
      adminNotes: String(mbr.adminNotes || ''),
      attachments: Array.isArray(mbr.attachments) ? mbr.attachments.slice(0, 10) : [],
      archived: Boolean(mbr.archived),
      archivedAt: mbr.archived ? now : null,
      archivedBy: mbr.archived ? membership.uid : '',
      version: Number(mbr.version || 1) + 1,
      updatedBy: membership.uid,
      updatedAt: now,
    };

    if (existingMemberIds.has(id)) {
      batch.update(refDoc, mutableFields);
    } else {
      batch.set(refDoc, {
        id,
        churchId: activeChurchId,
        ownerUid: membership.ownerUid,
        memberCode: String(mbr.memberCode || `JMT-R-${id.slice(-4)}`),
        ...mutableFields,
        version: 1,
        createdBy: membership.uid,
        createdAt: now,
      });
    }
    restoredCounts.congregationMembers++;
    await enqueueOp();
  }

  // Restore finance categories
  for (const cat of archive.collections.financeCategories) {
    const id = String(cat.id || '');
    if (!id) continue;
    const refDoc = doc(db, 'churches', activeChurchId, 'financeCategories', id);
    if (existingCatIds.has(id)) {
      batch.update(refDoc, {
        code: String(cat.code || 'CAT'),
        name: String(cat.name || 'Kategori'),
        description: String(cat.description || ''),
        color: String(cat.color || '#0F766E'),
        status: cat.status === 'inactive' ? 'inactive' : 'active',
        updatedBy: membership.uid,
        updatedAt: now,
      });
    } else {
      batch.set(refDoc, {
        id,
        churchId: activeChurchId,
        ownerUid: membership.ownerUid,
        type: cat.type === 'expense' ? 'expense' : 'income',
        code: String(cat.code || 'CAT'),
        name: String(cat.name || 'Kategori'),
        description: String(cat.description || ''),
        color: String(cat.color || '#0F766E'),
        status: cat.status === 'inactive' ? 'inactive' : 'active',
        authorizedViewerUids: [membership.ownerUid],
        createdBy: membership.uid,
        updatedBy: membership.uid,
        createdAt: now,
        updatedAt: now,
      });
    }
    restoredCounts.financeCategories++;
    await enqueueOp();
  }

  // Restore missing finance accounts (existing account balances cannot be arbitrarily rewritten client-side)
  for (const acc of archive.collections.financeAccounts) {
    const id = String(acc.id || '');
    if (!id) continue;
    if (existingAccIds.has(id)) {
      skippedImmutableCount++;
      continue;
    }
    const opening = Number(acc.openingBalance || 0);
    batch.set(doc(db, 'churches', activeChurchId, 'financeAccounts', id), {
      id,
      churchId: activeChurchId,
      ownerUid: membership.ownerUid,
      name: String(acc.name || 'Akun Kas'),
      accountType: ['cash', 'bank', 'operational', 'building', 'other'].includes(
        String(acc.accountType),
      )
        ? String(acc.accountType)
        : 'cash',
      currency: church.currency,
      openingBalance: opening,
      currentBalance: opening,
      status: ['active', 'inactive', 'archived'].includes(String(acc.status))
        ? String(acc.status)
        : 'active',
      notes: String(acc.notes || ''),
      authorizedViewerUids: [membership.ownerUid],
      createdBy: membership.uid,
      updatedBy: membership.uid,
      createdAt: now,
      updatedAt: now,
    });
    restoredCounts.financeAccounts++;
    await enqueueOp();
  }

  // Count immutable ledger transactions that already exist or are protected
  for (const tx of archive.collections.financeTransactions) {
    const id = String(tx.id || '');
    if (!id) continue;
    if (existingTxIds.has(id)) {
      skippedImmutableCount++;
      continue;
    }
    if (tx.status === 'draft') {
      batch.set(doc(db, 'churches', activeChurchId, 'financeTransactions', id), {
        id,
        txCode: String(tx.txCode || `TX-R-${id.slice(-4)}`),
        churchId: activeChurchId,
        ownerUid: membership.ownerUid,
        type: ['income', 'expense', 'transfer'].includes(String(tx.type))
          ? String(tx.type)
          : 'income',
        date: String(tx.date || new Date().toISOString().slice(0, 10)),
        ...(tx.categoryId ? {categoryId: String(tx.categoryId), categoryName: String(tx.categoryName || '')} : {}),
        description: String(tx.description || 'Transaksi dipulihkan'),
        amount: Math.max(1, Math.trunc(Number(tx.amount || 1))),
        accountId: String(tx.accountId || ''),
        accountName: String(tx.accountName || 'Kas'),
        ...(tx.toAccountId ? {toAccountId: String(tx.toAccountId), toAccountName: String(tx.toAccountName || '')} : {}),
        paymentMethod: String(tx.paymentMethod || 'cash'),
        anonymousRefCode: String(tx.anonymousRefCode || ''),
        counterparty: String(tx.counterparty || ''),
        receiptNumber: String(tx.receiptNumber || ''),
        attachments: [],
        status: 'draft',
        idempotencyKey: String(tx.idempotencyKey || generateSecureId('idem')),
        authorizedViewerUids: [membership.ownerUid],
        createdBy: membership.uid,
        createdByEmail: membership.email,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
      restoredCounts.financeTransactions++;
      await enqueueOp();
    } else {
      skippedImmutableCount++;
    }
  }

  const restoreLogId = generateSecureId('log');
  batch.set(doc(db, 'churches', activeChurchId, 'auditLogs', restoreLogId), {
    id: restoreLogId,
    churchId: activeChurchId,
    ownerUid: membership.ownerUid,
    actorUid: membership.uid,
    actorEmail: membership.email,
    actorRole: membership.role,
    action: 'backup.restored',
    targetType: 'backup',
    targetId: archive.backupId,
    summary: `Pemulihan arsip ${archive.backupId} selesai (pre-restore: ${preRestore.record.id}). Jemaat=${restoredCounts.congregationMembers}, Keluarga=${restoredCounts.familyGroups}, Kategori=${restoredCounts.financeCategories}, Dilewati (immutabel)=${skippedImmutableCount}.`,
    createdAt: now,
  });
  await enqueueOp();
  await flushBatch();

  return {
    preRestoreBackupId: preRestore.record.id,
    restoredCounts,
    skippedImmutableCount,
    verifiedBackupId: archive.backupId,
  };
}

export async function fetchChurchBackups(
  activeChurchId: string,
  membership: ChurchMembership,
): Promise<BackupRecord[]> {
  assertTenantContext(activeChurchId, activeChurchId, membership);
  if (membership.role !== 'owner') {
    throw new Error('Hanya Church Owner yang dapat melihat riwayat backup gereja.');
  }

  const path = `churches/${activeChurchId}/backups`;
  try {
    const q = query(
      collection(db, 'churches', activeChurchId, 'backups'),
      where('ownerUid', '==', membership.ownerUid),
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as BackupRecord)
      .sort((a, b) => {
        const aSec = (a.createdAt as {seconds?: number})?.seconds || 0;
        const bSec = (b.createdAt as {seconds?: number})?.seconds || 0;
        return bSec - aSec;
      });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchOwnershipTransfers(
  activeChurchId: string,
  membership: ChurchMembership,
): Promise<OwnershipTransferRequest[]> {
  assertTenantContext(activeChurchId, activeChurchId, membership);
  const path = `churches/${activeChurchId}/ownershipTransfers`;
  try {
    const q =
      membership.role === 'owner'
        ? query(
            collection(db, 'churches', activeChurchId, 'ownershipTransfers'),
            where('ownerUid', '==', membership.ownerUid),
          )
        : query(
            collection(db, 'churches', activeChurchId, 'ownershipTransfers'),
            where('toUid', '==', membership.uid),
          );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as OwnershipTransferRequest)
      .sort((a, b) => {
        const aSec = (a.createdAt as {seconds?: number})?.seconds || 0;
        const bSec = (b.createdAt as {seconds?: number})?.seconds || 0;
        return bSec - aSec;
      });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function initiateOwnershipTransfer(
  activeChurchId: string,
  actorMembership: ChurchMembership,
  targetMembership: ChurchMembership,
): Promise<OwnershipTransferRequest> {
  assertBrowserOnline('Inisiasi pemindahan kepemilikan gereja');
  assertTenantContext(activeChurchId, targetMembership.churchId, actorMembership);
  const check = validateOwnershipTransferCandidate(actorMembership, targetMembership);
  if (!check.valid) {
    throw new Error(check.error || 'Kandidat penerima kepemilikan tidak valid.');
  }

  const transferId = generateSecureId('own');
  const logId = generateSecureId('log');
  const now = serverTimestamp();
  const expiresAt = Timestamp.fromDate(new Date(Date.now() + 72 * 60 * 60 * 1000));

  const payload: OwnershipTransferRequest = {
    id: transferId,
    churchId: activeChurchId,
    ownerUid: actorMembership.ownerUid,
    fromUid: actorMembership.uid,
    fromEmail: actorMembership.email,
    toUid: targetMembership.uid,
    toEmail: targetMembership.email,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    expiresAt,
  };

  const batch = writeBatch(db);
  batch.set(doc(db, 'churches', activeChurchId, 'ownershipTransfers', transferId), payload);
  batch.set(doc(db, 'churches', activeChurchId, 'auditLogs', logId), {
    id: logId,
    churchId: activeChurchId,
    ownerUid: actorMembership.ownerUid,
    actorUid: actorMembership.uid,
    actorEmail: actorMembership.email,
    actorRole: actorMembership.role,
    action: 'ownership.transfer_initiated',
    targetType: 'ownershipTransfer',
    targetId: transferId,
    summary: `Permintaan pemindahan kepemilikan dikirim ke ${targetMembership.email}. Menunggu konfirmasi penerima.`,
    createdAt: now,
  });

  try {
    await batch.commit();
    return payload;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `churches/${activeChurchId}/ownershipTransfers/${transferId}`);
  }
}

export async function respondToOwnershipTransfer(
  activeChurchId: string,
  actorMembership: ChurchMembership,
  transfer: OwnershipTransferRequest,
  accept: boolean,
): Promise<void> {
  assertBrowserOnline('Konfirmasi pemindahan kepemilikan gereja');
  assertTenantContext(activeChurchId, transfer.churchId, actorMembership);

  if (accept && transfer.toUid !== actorMembership.uid) {
    throw new Error('Hanya akun penerima yang ditunjuk yang dapat menyetujui transfer.');
  }
  if (!accept && actorMembership.role !== 'owner') {
    throw new Error('Hanya Church Owner pengirim yang dapat membatalkan transfer ini.');
  }

  const nextStatus = accept ? 'accepted' : 'cancelled';
  const logId = generateSecureId('log');
  const now = serverTimestamp();
  const batch = writeBatch(db);

  batch.update(doc(db, 'churches', activeChurchId, 'ownershipTransfers', transfer.id), {
    status: nextStatus,
    updatedAt: now,
  });
  batch.set(doc(db, 'churches', activeChurchId, 'auditLogs', logId), {
    id: logId,
    churchId: activeChurchId,
    ownerUid: transfer.ownerUid,
    actorUid: actorMembership.uid,
    actorEmail: actorMembership.email,
    actorRole: actorMembership.role,
    action: accept ? 'ownership.transfer_accepted' : 'ownership.transfer_cancelled',
    targetType: 'ownershipTransfer',
    targetId: transfer.id,
    summary: accept
      ? `${actorMembership.email} menyetujui menerima tanggung jawab sebagai Church Owner.`
      : `Permintaan pemindahan kepemilikan ke ${transfer.toEmail} dibatalkan.`,
    createdAt: now,
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `churches/${activeChurchId}/ownershipTransfers/${transfer.id}`,
    );
  }
}

export async function executeOwnershipTransferServer(
  activeChurchId: string,
  transferId: string,
): Promise<void> {
  assertBrowserOnline('Finalisasi pemindahan kepemilikan gereja');
  try {
    const fn = httpsCallable<{churchId: string; transferId: string}, {success: boolean}>(
      getFunctions(firebaseApp),
      'completeChurchOwnershipTransfer',
    );
    await fn({churchId: activeChurchId, transferId});
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Finalisasi pemindahan kepemilikan membutuhkan Cloud Function 'completeChurchOwnershipTransfer' aktif di Firebase (${msg}). Pastikan functions telah di-deploy melalui Firebase Blaze.`,
    );
  }
}

export async function checkIsPlatformAdmin(uid: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, 'platformAdmins', uid));
    return snap.exists() && snap.data()?.status === 'active';
  } catch {
    return false;
  }
}
