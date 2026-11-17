import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import {deleteObject, getBytes, ref, uploadBytes} from 'firebase/storage';
import {db, storage} from '../firebase';
import {
  canApproveTransaction,
  canEditTransactionDraft,
  canRejectTransaction,
  canSubmitTransaction,
  canVoidTransaction,
  computeApprovalBalanceDeltas,
  computeVoidBalanceDeltas,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  validateAccountInput,
  validateSafeIntegerAmount,
  validateTransactionInput,
  type TransactionDraftInput,
} from '../domain/finance';
import {
  assertTenantContext,
  hasAnyFinancePermission,
  hasFinancePermission,
} from '../domain/rbac';
import type {
  ChurchMembership,
  CurrencyCode,
  FinanceAccount,
  FinanceAccountStatus,
  FinanceAccountType,
  FinanceAttachment,
  FinanceAuditLog,
  FinanceCategory,
  FinanceCategoryType,
  FinancePaymentMethod,
  FinanceSettings,
  FinanceTransaction,
} from '../types/domain';
import {handleFirestoreError, OperationType} from '../utils/firestoreErrors';
import {assertBrowserOnline} from '../utils/networkGuard';
import {detectVersionConflict} from '../domain/backup';

const ALLOWED_RECEIPT_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

function generateId(prefix: string): string {
  const rand =
    typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 14)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}-${rand}`;
}

function generateTxCode(): string {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `TX-${ym}-${rand}`;
}

function buildFinanceQuery(churchId: string, colName: string, membership: ChurchMembership) {
  const colRef = collection(db, 'churches', churchId, colName);
  if (membership.role === 'owner') {
    return query(colRef, where('ownerUid', '==', membership.ownerUid));
  }
  return query(colRef, where('authorizedViewerUids', 'array-contains', membership.uid));
}

async function resolveViewerUids(
  churchId: string,
  membership: ChurchMembership,
): Promise<string[]> {
  if (membership.role === 'owner') {
    try {
      const snap = await getDocs(
        query(
          collection(db, 'churches', churchId, 'memberships'),
          where('ownerUid', '==', membership.ownerUid),
        ),
      );
      const uids = new Set<string>([membership.ownerUid]);
      for (const d of snap.docs) {
        const m = d.data() as ChurchMembership;
        if (m.status !== 'active') continue;
        if (m.role === 'owner') uids.add(m.uid);
        if (
          (m.role === 'finance_manager' || m.role === 'finance_staff') &&
          m.financePermissions.length > 0
        ) {
          uids.add(m.uid);
        }
      }
      return Array.from(uids).slice(0, 50);
    } catch {
      return [membership.ownerUid];
    }
  }

  try {
    const snap = await getDocs(buildFinanceQuery(churchId, 'financeSettings', membership));
    if (!snap.empty) {
      const existing = snap.docs[0].data() as FinanceSettings;
      if (Array.isArray(existing.authorizedViewerUids) && existing.authorizedViewerUids.length > 0) {
        const merged = new Set([membership.ownerUid, membership.uid, ...existing.authorizedViewerUids]);
        return Array.from(merged).slice(0, 50);
      }
    }
  } catch {
    // Fallback below
  }
  return Array.from(new Set([membership.ownerUid, membership.uid]));
}

export async function syncFinanceViewerUids(
  activeChurchId: string,
  actorMembership: ChurchMembership,
): Promise<void> {
  assertTenantContext(activeChurchId, activeChurchId, actorMembership);
  if (actorMembership.role !== 'owner') {
    throw new Error('Hanya Church Owner yang dapat menyinkronkan daftar akses keuangan.');
  }

  const viewerUids = await resolveViewerUids(activeChurchId, actorMembership);
  const colNames = [
    'financeAccounts',
    'financeCategories',
    'financeTransactions',
    'financeSettings',
    'financeAuditLogs',
  ];

  let batch = writeBatch(db);
  let opCount = 0;

  for (const colName of colNames) {
    const snap = await getDocs(
      query(
        collection(db, 'churches', activeChurchId, colName),
        where('ownerUid', '==', actorMembership.ownerUid),
      ),
    );
    for (const d of snap.docs) {
      if (colName === 'financeAuditLogs') continue; // Audit logs are append-only
      batch.update(d.ref, {
        authorizedViewerUids: viewerUids,
        ...(colName === 'financeAccounts' || colName === 'financeCategories' || colName === 'financeSettings'
          ? {updatedBy: actorMembership.uid, updatedAt: serverTimestamp()}
          : {updatedAt: serverTimestamp()}),
      });
      opCount++;
      if (opCount >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        opCount = 0;
      }
    }
  }

  if (opCount > 0) {
    await batch.commit();
  }
}

async function appendFinanceAuditLog(
  churchId: string,
  membership: ChurchMembership,
  viewerUids: string[],
  entry: {
    action: string;
    targetType: string;
    targetId: string;
    txCode?: string;
    summary: string;
  },
): Promise<void> {
  const finLogId = generateId('flog');
  const churchLogId = generateId('log');
  const now = serverTimestamp();

  const batch = writeBatch(db);
  batch.set(doc(db, 'churches', churchId, 'financeAuditLogs', finLogId), {
    id: finLogId,
    churchId,
    ownerUid: membership.ownerUid,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    ...(entry.txCode ? {txCode: entry.txCode} : {}),
    summary: entry.summary.slice(0, 480),
    actorUid: membership.uid,
    actorEmail: membership.email,
    actorRole: membership.role,
    authorizedViewerUids: viewerUids,
    createdAt: now,
  });

  batch.set(doc(db, 'churches', churchId, 'auditLogs', churchLogId), {
    id: churchLogId,
    churchId,
    ownerUid: membership.ownerUid,
    actorUid: membership.uid,
    actorEmail: membership.email,
    actorRole: membership.role,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    summary: entry.summary.slice(0, 480),
    createdAt: now,
  });

  await batch.commit();
}

// ============================================================
// REAL-TIME SUBSCRIPTIONS (onSnapshot)
// ============================================================

export function subscribeFinanceAccounts(
  churchId: string,
  membership: ChurchMembership,
  onData: (accounts: FinanceAccount[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  assertTenantContext(churchId, churchId, membership);
  if (
    !hasFinancePermission(membership, 'finance.view') &&
    !hasFinancePermission(membership, 'finance.viewReports') &&
    !hasFinancePermission(membership, 'finance.manageAccounts')
  ) {
    onData([]);
    return () => {};
  }
  const path = `churches/${churchId}/financeAccounts`;
  return onSnapshot(
    buildFinanceQuery(churchId, 'financeAccounts', membership),
    (snap) => {
      const items = snap.docs
        .map((d) => d.data() as FinanceAccount)
        .sort((a, b) => a.name.localeCompare(b.name, 'id'));
      onData(items);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    },
  );
}

export function subscribeFinanceCategories(
  churchId: string,
  membership: ChurchMembership,
  onData: (categories: FinanceCategory[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  assertTenantContext(churchId, churchId, membership);
  if (!hasAnyFinancePermission(membership)) {
    onData([]);
    return () => {};
  }
  const path = `churches/${churchId}/financeCategories`;
  return onSnapshot(
    buildFinanceQuery(churchId, 'financeCategories', membership),
    (snap) => {
      const items = snap.docs
        .map((d) => d.data() as FinanceCategory)
        .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name, 'id'));
      onData(items);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    },
  );
}

export function subscribeFinanceTransactions(
  churchId: string,
  membership: ChurchMembership,
  onData: (transactions: FinanceTransaction[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  assertTenantContext(churchId, churchId, membership);
  if (
    !hasFinancePermission(membership, 'finance.view') &&
    !hasFinancePermission(membership, 'finance.viewReports') &&
    !hasFinancePermission(membership, 'finance.approve')
  ) {
    onData([]);
    return () => {};
  }
  const path = `churches/${churchId}/financeTransactions`;
  return onSnapshot(
    buildFinanceQuery(churchId, 'financeTransactions', membership),
    (snap) => {
      const items = snap.docs
        .map((d) => d.data() as FinanceTransaction)
        .sort((a, b) => b.date.localeCompare(a.date) || b.txCode.localeCompare(a.txCode));
      onData(items);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    },
  );
}

export function subscribeFinanceSettings(
  churchId: string,
  membership: ChurchMembership,
  onData: (settings: FinanceSettings | null) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  assertTenantContext(churchId, churchId, membership);
  if (!hasAnyFinancePermission(membership)) {
    onData(null);
    return () => {};
  }
  const path = `churches/${churchId}/financeSettings`;
  return onSnapshot(
    buildFinanceQuery(churchId, 'financeSettings', membership),
    (snap) => {
      if (snap.empty) {
        onData(null);
      } else {
        onData(snap.docs[0].data() as FinanceSettings);
      }
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    },
  );
}

export function subscribeFinanceAuditLogs(
  churchId: string,
  membership: ChurchMembership,
  onData: (logs: FinanceAuditLog[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  assertTenantContext(churchId, churchId, membership);
  if (
    !hasFinancePermission(membership, 'finance.view') &&
    !hasFinancePermission(membership, 'finance.viewReports') &&
    !hasFinancePermission(membership, 'finance.approve')
  ) {
    onData([]);
    return () => {};
  }
  const path = `churches/${churchId}/financeAuditLogs`;
  return onSnapshot(
    buildFinanceQuery(churchId, 'financeAuditLogs', membership),
    (snap) => {
      const items = snap.docs
        .map((d) => d.data() as FinanceAuditLog)
        .sort((a, b) => {
          const aSec = (a.createdAt as {seconds?: number})?.seconds || 0;
          const bSec = (b.createdAt as {seconds?: number})?.seconds || 0;
          return bSec - aSec;
        });
      onData(items);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    },
  );
}

// ============================================================
// ACCOUNTS & INTER-ACCOUNT TRANSFER
// ============================================================

export async function createFinanceAccount(
  churchId: string,
  membership: ChurchMembership,
  currency: CurrencyCode,
  input: {
    name: string;
    accountType: FinanceAccountType;
    openingBalance: number | string;
    notes?: string;
  },
): Promise<string> {
  assertBrowserOnline('Pembuatan akun keuangan');
  assertTenantContext(churchId, churchId, membership);
  if (!hasFinancePermission(membership, 'finance.manageAccounts')) {
    throw new Error('Anda tidak memiliki izin finance.manageAccounts untuk menambah akun.');
  }

  const check = validateAccountInput(input);
  if (!check.valid) throw new Error(check.error);

  const accountId = generateId('acc');
  const viewerUids = await resolveViewerUids(churchId, membership);
  const now = serverTimestamp();

  const payload: Record<string, unknown> = {
    id: accountId,
    churchId,
    ownerUid: membership.ownerUid,
    name: input.name.trim(),
    accountType: input.accountType,
    currency,
    openingBalance: check.openingBalance,
    currentBalance: check.openingBalance,
    status: 'active',
    authorizedViewerUids: viewerUids,
    createdBy: membership.uid,
    updatedBy: membership.uid,
    createdAt: now,
    updatedAt: now,
  };
  if (input.notes?.trim()) {
    payload.notes = input.notes.trim().slice(0, 300);
  }

  try {
    await setDoc(doc(db, 'churches', churchId, 'financeAccounts', accountId), payload);
    await appendFinanceAuditLog(churchId, membership, viewerUids, {
      action: 'finance.account_created',
      targetType: 'financeAccount',
      targetId: accountId,
      summary: `Akun keuangan "${input.name.trim()}" (${input.accountType}) dibuat dengan saldo awal ${check.openingBalance}.`,
    });
    return accountId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `churches/${churchId}/financeAccounts/${accountId}`);
  }
}

export async function updateFinanceAccount(
  churchId: string,
  membership: ChurchMembership,
  account: FinanceAccount,
  updates: {
    name: string;
    accountType: FinanceAccountType;
    status: FinanceAccountStatus;
    notes?: string;
  },
): Promise<void> {
  assertBrowserOnline('Pembaruan akun keuangan');
  assertTenantContext(churchId, account.churchId, membership);
  if (!hasFinancePermission(membership, 'finance.manageAccounts')) {
    throw new Error('Anda tidak memiliki izin finance.manageAccounts untuk mengubah akun.');
  }
  const name = updates.name.trim();
  if (name.length < 2 || name.length > 120) {
    throw new Error('Nama akun harus antara 2–120 karakter.');
  }

  try {
    await updateDoc(doc(db, 'churches', churchId, 'financeAccounts', account.id), {
      name,
      accountType: updates.accountType,
      status: updates.status,
      notes: (updates.notes || '').trim().slice(0, 300),
      updatedBy: membership.uid,
      updatedAt: serverTimestamp(),
    });
    const viewerUids = await resolveViewerUids(churchId, membership);
    await appendFinanceAuditLog(churchId, membership, viewerUids, {
      action: 'finance.account_updated',
      targetType: 'financeAccount',
      targetId: account.id,
      summary: `Akun "${name}" diperbarui (status: ${updates.status}).`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `churches/${churchId}/financeAccounts/${account.id}`);
  }
}

export async function createOrExecuteTransfer(
  churchId: string,
  membership: ChurchMembership,
  input: {
    date: string;
    fromAccount: FinanceAccount;
    toAccount: FinanceAccount;
    amount: number | string;
    paymentMethod: FinancePaymentMethod;
    description: string;
    executeImmediately?: boolean;
  },
  settings?: FinanceSettings | null,
): Promise<string> {
  assertBrowserOnline('Transfer dana antar akun');
  assertTenantContext(churchId, churchId, membership);
  if (!hasFinancePermission(membership, 'finance.manageAccounts')) {
    throw new Error('Anda tidak memiliki izin finance.manageAccounts untuk membuat transfer.');
  }

  const check = validateTransactionInput(
    {
      type: 'transfer',
      date: input.date,
      description: input.description,
      amount: input.amount,
      accountId: input.fromAccount.id,
      toAccountId: input.toAccount.id,
      paymentMethod: input.paymentMethod,
    },
    settings,
  );
  if (!check.valid) throw new Error(check.error);

  const canImmediate =
    Boolean(input.executeImmediately) && hasFinancePermission(membership, 'finance.approve');

  const txId = generateId('tx');
  const txCode = generateTxCode();
  const viewerUids = await resolveViewerUids(churchId, membership);

  if (canImmediate) {
    const finalStatus = settings?.autoLockOnApproval ? 'locked' : 'approved';
    try {
      await runTransaction(db, async (trx) => {
        const fromRef = doc(db, 'churches', churchId, 'financeAccounts', input.fromAccount.id);
        const toRef = doc(db, 'churches', churchId, 'financeAccounts', input.toAccount.id);
        const txRef = doc(db, 'churches', churchId, 'financeTransactions', txId);

        const fromSnap = await trx.get(fromRef);
        const toSnap = await trx.get(toRef);
        if (!fromSnap.exists() || !toSnap.exists()) {
          throw new Error('Akun sumber atau tujuan transfer tidak ditemukan.');
        }

        const fromData = fromSnap.data() as FinanceAccount;
        const toData = toSnap.data() as FinanceAccount;
        const now = serverTimestamp();

        trx.update(fromRef, {
          currentBalance: fromData.currentBalance - check.amount,
          updatedBy: membership.uid,
          updatedAt: now,
        });
        trx.update(toRef, {
          currentBalance: toData.currentBalance + check.amount,
          updatedBy: membership.uid,
          updatedAt: now,
        });
        trx.set(txRef, {
          id: txId,
          txCode,
          churchId,
          ownerUid: membership.ownerUid,
          type: 'transfer',
          date: input.date,
          description: input.description.trim(),
          amount: check.amount,
          accountId: input.fromAccount.id,
          accountName: input.fromAccount.name,
          toAccountId: input.toAccount.id,
          toAccountName: input.toAccount.name,
          paymentMethod: input.paymentMethod,
          status: finalStatus,
          idempotencyKey: generateId('idem'),
          authorizedViewerUids: viewerUids,
          createdBy: membership.uid,
          createdByEmail: membership.email,
          approvedBy: membership.uid,
          approvedByEmail: membership.email,
          approvedAt: now,
          ...(finalStatus === 'locked' ? {lockedAt: now} : {}),
          version: 1,
          createdAt: now,
          updatedAt: now,
        });
      });

      await appendFinanceAuditLog(churchId, membership, viewerUids, {
        action: 'finance.transfer_executed',
        targetType: 'financeTransaction',
        targetId: txId,
        txCode,
        summary: `Transfer antar akun ${input.fromAccount.name} -> ${input.toAccount.name} sebesar ${check.amount} dieksekusi.`,
      });
      return txId;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `churches/${churchId}/financeTransactions/${txId}`);
    }
  } else {
    const now = serverTimestamp();
    try {
      await setDoc(doc(db, 'churches', churchId, 'financeTransactions', txId), {
        id: txId,
        txCode,
        churchId,
        ownerUid: membership.ownerUid,
        type: 'transfer',
        date: input.date,
        description: input.description.trim(),
        amount: check.amount,
        accountId: input.fromAccount.id,
        accountName: input.fromAccount.name,
        toAccountId: input.toAccount.id,
        toAccountName: input.toAccount.name,
        paymentMethod: input.paymentMethod,
        status: 'submitted',
        idempotencyKey: generateId('idem'),
        authorizedViewerUids: viewerUids,
        createdBy: membership.uid,
        createdByEmail: membership.email,
        submittedBy: membership.uid,
        submittedAt: now,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
      await appendFinanceAuditLog(churchId, membership, viewerUids, {
        action: 'finance.transfer_submitted',
        targetType: 'financeTransaction',
        targetId: txId,
        txCode,
        summary: `Pengajuan transfer ${input.fromAccount.name} -> ${input.toAccount.name} sebesar ${check.amount} menunggu persetujuan.`,
      });
      return txId;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `churches/${churchId}/financeTransactions/${txId}`);
    }
  }
}

// ============================================================
// CATEGORIES CRUD & SEEDING
// ============================================================

export async function createFinanceCategory(
  churchId: string,
  membership: ChurchMembership,
  input: {
    type: FinanceCategoryType;
    code: string;
    name: string;
    description?: string;
    color: string;
  },
): Promise<string> {
  assertBrowserOnline('Pembuatan kategori keuangan');
  assertTenantContext(churchId, churchId, membership);
  if (!hasFinancePermission(membership, 'finance.manageCategories')) {
    throw new Error('Anda tidak memiliki izin finance.manageCategories untuk menambah kategori.');
  }

  const cleanCode = input.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '-');
  if (cleanCode.length < 2 || cleanCode.length > 32) {
    throw new Error('Kode kategori harus antara 2–32 karakter alfanumerik.');
  }
  const cleanName = input.name.trim();
  if (cleanName.length < 2 || cleanName.length > 100) {
    throw new Error('Nama kategori harus antara 2–100 karakter.');
  }

  const categoryId = generateId('cat');
  const viewerUids = await resolveViewerUids(churchId, membership);
  const now = serverTimestamp();

  try {
    await setDoc(doc(db, 'churches', churchId, 'financeCategories', categoryId), {
      id: categoryId,
      churchId,
      ownerUid: membership.ownerUid,
      type: input.type,
      code: cleanCode,
      name: cleanName,
      description: (input.description || '').trim().slice(0, 300),
      color: input.color || (input.type === 'income' ? '#0F766E' : '#BE123C'),
      status: 'active',
      authorizedViewerUids: viewerUids,
      createdBy: membership.uid,
      updatedBy: membership.uid,
      createdAt: now,
      updatedAt: now,
    });
    await appendFinanceAuditLog(churchId, membership, viewerUids, {
      action: 'finance.category_created',
      targetType: 'financeCategory',
      targetId: categoryId,
      summary: `Kategori ${input.type} "${cleanName}" (${cleanCode}) ditambahkan.`,
    });
    return categoryId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `churches/${churchId}/financeCategories/${categoryId}`);
  }
}

export async function updateFinanceCategory(
  churchId: string,
  membership: ChurchMembership,
  category: FinanceCategory,
  updates: {
    code: string;
    name: string;
    description?: string;
    color: string;
    status: 'active' | 'inactive';
  },
): Promise<void> {
  assertBrowserOnline('Pembaruan kategori keuangan');
  assertTenantContext(churchId, category.churchId, membership);
  if (!hasFinancePermission(membership, 'finance.manageCategories')) {
    throw new Error('Anda tidak memiliki izin finance.manageCategories.');
  }
  const cleanCode = updates.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '-');
  const cleanName = updates.name.trim();
  if (cleanCode.length < 2 || cleanName.length < 2) {
    throw new Error('Kode dan nama kategori wajib valid.');
  }

  try {
    await updateDoc(doc(db, 'churches', churchId, 'financeCategories', category.id), {
      code: cleanCode,
      name: cleanName,
      description: (updates.description || '').trim().slice(0, 300),
      color: updates.color,
      status: updates.status,
      updatedBy: membership.uid,
      updatedAt: serverTimestamp(),
    });
    const viewerUids = await resolveViewerUids(churchId, membership);
    await appendFinanceAuditLog(churchId, membership, viewerUids, {
      action: 'finance.category_updated',
      targetType: 'financeCategory',
      targetId: category.id,
      summary: `Kategori "${cleanName}" diperbarui (status: ${updates.status}).`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `churches/${churchId}/financeCategories/${category.id}`);
  }
}

export async function seedDefaultFinanceCategories(
  churchId: string,
  membership: ChurchMembership,
  existingCategories: readonly FinanceCategory[],
): Promise<number> {
  assertBrowserOnline('Inisialisasi kategori keuangan');
  assertTenantContext(churchId, churchId, membership);
  if (!hasFinancePermission(membership, 'finance.manageCategories')) {
    throw new Error('Anda tidak memiliki izin finance.manageCategories.');
  }

  const existingCodes = new Set(existingCategories.map((c) => c.code.toUpperCase()));
  const viewerUids = await resolveViewerUids(churchId, membership);
  const now = serverTimestamp();
  const batch = writeBatch(db);
  let added = 0;

  for (const item of DEFAULT_INCOME_CATEGORIES) {
    if (existingCodes.has(item.code)) continue;
    const id = generateId('cat');
    batch.set(doc(db, 'churches', churchId, 'financeCategories', id), {
      id,
      churchId,
      ownerUid: membership.ownerUid,
      type: 'income',
      code: item.code,
      name: item.name,
      description: item.description,
      color: item.color,
      status: 'active',
      authorizedViewerUids: viewerUids,
      createdBy: membership.uid,
      updatedBy: membership.uid,
      createdAt: now,
      updatedAt: now,
    });
    added++;
  }

  for (const item of DEFAULT_EXPENSE_CATEGORIES) {
    if (existingCodes.has(item.code)) continue;
    const id = generateId('cat');
    batch.set(doc(db, 'churches', churchId, 'financeCategories', id), {
      id,
      churchId,
      ownerUid: membership.ownerUid,
      type: 'expense',
      code: item.code,
      name: item.name,
      description: item.description,
      color: item.color,
      status: 'active',
      authorizedViewerUids: viewerUids,
      createdBy: membership.uid,
      updatedBy: membership.uid,
      createdAt: now,
      updatedAt: now,
    });
    added++;
  }

  if (added === 0) return 0;

  try {
    await batch.commit();
    await appendFinanceAuditLog(churchId, membership, viewerUids, {
      action: 'finance.categories_seeded',
      targetType: 'financeCategory',
      targetId: churchId,
      summary: `${added} kategori standar pemasukan & pengeluaran ditambahkan.`,
    });
    return added;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `churches/${churchId}/financeCategories`);
  }
}

// ============================================================
// TRANSACTIONS WORKFLOW (DRAFT -> SUBMITTED -> APPROVED/LOCKED / REJECTED / VOIDED)
// ============================================================

export async function createFinanceTransaction(
  churchId: string,
  membership: ChurchMembership,
  input: TransactionDraftInput,
  accounts: readonly FinanceAccount[],
  categories: readonly FinanceCategory[],
  settings?: FinanceSettings | null,
  submitImmediately = false,
): Promise<FinanceTransaction> {
  assertBrowserOnline('Pencatatan transaksi keuangan');
  assertTenantContext(churchId, churchId, membership);
  if (!hasFinancePermission(membership, 'finance.create')) {
    throw new Error('Anda tidak memiliki izin finance.create untuk membuat transaksi.');
  }
  if (submitImmediately && !hasFinancePermission(membership, 'finance.submit')) {
    throw new Error('Anda tidak memiliki izin finance.submit untuk langsung mengajukan transaksi.');
  }

  const check = validateTransactionInput(input, settings);
  if (!check.valid) throw new Error(check.error);

  if (
    submitImmediately &&
    settings &&
    settings.requireReceiptAboveAmount > 0 &&
    check.amount > settings.requireReceiptAboveAmount &&
    !input.hasAttachment &&
    !(input.receiptNumber || '').trim()
  ) {
    throw new Error(
      `Transaksi di atas ${settings.requireReceiptAboveAmount} wajib melampirkan bukti atau nomor kwitansi sebelum diajukan.`,
    );
  }

  const account = accounts.find((a) => a.id === input.accountId);
  if (!account || account.status !== 'active') {
    throw new Error('Akun kas/bank tidak aktif atau tidak ditemukan.');
  }
  const toAccount = input.toAccountId
    ? accounts.find((a) => a.id === input.toAccountId)
    : undefined;
  const category = input.categoryId
    ? categories.find((c) => c.id === input.categoryId)
    : undefined;

  const txId = generateId('tx');
  const txCode = generateTxCode();
  const idempotencyKey = generateId('idem');
  const viewerUids = await resolveViewerUids(churchId, membership);
  const now = serverTimestamp();

  const status = submitImmediately ? 'submitted' : 'draft';
  const payload: Record<string, unknown> = {
    id: txId,
    txCode,
    churchId,
    ownerUid: membership.ownerUid,
    type: input.type,
    date: input.date,
    ...(category ? {categoryId: category.id, categoryName: category.name} : {}),
    description: input.description.trim(),
    amount: check.amount,
    accountId: account.id,
    accountName: account.name,
    ...(toAccount ? {toAccountId: toAccount.id, toAccountName: toAccount.name} : {}),
    paymentMethod: input.paymentMethod,
    anonymousRefCode: check.anonymousRefCode,
    counterparty: (input.counterparty || '').trim().slice(0, 120),
    receiptNumber: (input.receiptNumber || '').trim().slice(0, 60),
    attachments: [],
    status,
    idempotencyKey,
    authorizedViewerUids: viewerUids,
    createdBy: membership.uid,
    createdByEmail: membership.email,
    ...(submitImmediately ? {submittedBy: membership.uid, submittedAt: now} : {}),
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, 'churches', churchId, 'financeTransactions', txId), payload);
    await appendFinanceAuditLog(churchId, membership, viewerUids, {
      action: submitImmediately ? 'finance.tx_created_and_submitted' : 'finance.tx_draft_created',
      targetType: 'financeTransaction',
      targetId: txId,
      txCode,
      summary: `Transaksi ${txCode} (${input.type}) sebesar ${check.amount} dibuat dengan status ${status}.`,
    });
    return payload as unknown as FinanceTransaction;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `churches/${churchId}/financeTransactions/${txId}`);
  }
}

export async function updateDraftFinanceTransaction(
  churchId: string,
  membership: ChurchMembership,
  existingTx: FinanceTransaction,
  input: TransactionDraftInput,
  accounts: readonly FinanceAccount[],
  categories: readonly FinanceCategory[],
  settings?: FinanceSettings | null,
): Promise<void> {
  assertBrowserOnline('Perubahan draf transaksi');
  assertTenantContext(churchId, existingTx.churchId, membership);
  if (!canEditTransactionDraft(membership, existingTx)) {
    throw new Error('Anda tidak memiliki izin mengubah draf atau status transaksi sudah dikunci.');
  }

  const check = validateTransactionInput(input, settings);
  if (!check.valid) throw new Error(check.error);

  const account = accounts.find((a) => a.id === input.accountId);
  if (!account) throw new Error('Akun kas/bank tidak ditemukan.');
  const toAccount = input.toAccountId
    ? accounts.find((a) => a.id === input.toAccountId)
    : undefined;
  const category = input.categoryId
    ? categories.find((c) => c.id === input.categoryId)
    : undefined;

  try {
    await runTransaction(db, async (trx) => {
      const txRef = doc(db, 'churches', churchId, 'financeTransactions', existingTx.id);
      const snap = await trx.get(txRef);
      if (!snap.exists()) throw new Error('Transaksi tidak ditemukan.');
      const liveTx = snap.data() as FinanceTransaction;
      if (liveTx.status !== 'draft' && liveTx.status !== 'rejected') {
        throw new Error('Status transaksi telah berubah dan tidak lagi dapat diubah sebagai draf.');
      }
      if (detectVersionConflict(existingTx.version, liveTx.version)) {
        throw new Error(
          'Konflik versi: transaksi ini baru saja diperbarui oleh pengguna lain. Muat ulang data terbaru sebelum menyimpan.',
        );
      }

      trx.update(txRef, {
        type: input.type,
        date: input.date,
        categoryId: category ? category.id : '',
        categoryName: category ? category.name : '',
        description: input.description.trim(),
        amount: check.amount,
        accountId: account.id,
        accountName: account.name,
        toAccountId: toAccount ? toAccount.id : '',
        toAccountName: toAccount ? toAccount.name : '',
        paymentMethod: input.paymentMethod,
        anonymousRefCode: check.anonymousRefCode,
        counterparty: (input.counterparty || '').trim().slice(0, 120),
        receiptNumber: (input.receiptNumber || '').trim().slice(0, 60),
        status: 'draft',
        rejectionReason: '',
        version: (liveTx.version ?? 1) + 1,
        updatedAt: serverTimestamp(),
      });
    });

    const viewerUids = await resolveViewerUids(churchId, membership);
    await appendFinanceAuditLog(churchId, membership, viewerUids, {
      action: 'finance.tx_draft_updated',
      targetType: 'financeTransaction',
      targetId: existingTx.id,
      txCode: existingTx.txCode,
      summary: `Draf transaksi ${existingTx.txCode} diperbarui (${check.amount}).`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `churches/${churchId}/financeTransactions/${existingTx.id}`);
  }
}

export async function submitFinanceTransaction(
  churchId: string,
  membership: ChurchMembership,
  tx: FinanceTransaction,
  settings?: FinanceSettings | null,
): Promise<void> {
  assertBrowserOnline('Pengajuan persetujuan transaksi');
  assertTenantContext(churchId, tx.churchId, membership);
  if (!canSubmitTransaction(membership, tx)) {
    throw new Error('Anda tidak memiliki izin finance.submit atau status transaksi tidak dapat diajukan.');
  }

  if (
    settings &&
    settings.requireReceiptAboveAmount > 0 &&
    tx.amount > settings.requireReceiptAboveAmount &&
    (!tx.attachments || tx.attachments.length === 0) &&
    !(tx.receiptNumber || '').trim()
  ) {
    throw new Error(
      `Transaksi di atas ${settings.requireReceiptAboveAmount} wajib melampirkan bukti atau nomor kwitansi sebelum diajukan.`,
    );
  }

  try {
    await runTransaction(db, async (trx) => {
      const txRef = doc(db, 'churches', churchId, 'financeTransactions', tx.id);
      const snap = await trx.get(txRef);
      if (!snap.exists()) throw new Error('Transaksi tidak ditemukan.');
      const liveTx = snap.data() as FinanceTransaction;
      if (liveTx.status !== 'draft' && liveTx.status !== 'rejected') {
        throw new Error('Transaksi ini sudah diajukan atau diproses oleh pengguna lain.');
      }
      if (detectVersionConflict(tx.version, liveTx.version)) {
        throw new Error(
          'Konflik versi: transaksi ini baru saja diperbarui. Periksa ulang data terbaru sebelum mengajukan.',
        );
      }

      const now = serverTimestamp();
      trx.update(txRef, {
        status: 'submitted',
        submittedBy: membership.uid,
        submittedAt: now,
        rejectionReason: '',
        version: (liveTx.version ?? 1) + 1,
        updatedAt: now,
      });
    });

    const viewerUids = await resolveViewerUids(churchId, membership);
    await appendFinanceAuditLog(churchId, membership, viewerUids, {
      action: 'finance.tx_submitted',
      targetType: 'financeTransaction',
      targetId: tx.id,
      txCode: tx.txCode,
      summary: `Transaksi ${tx.txCode} diajukan untuk persetujuan.`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `churches/${churchId}/financeTransactions/${tx.id}`);
  }
}

export async function approveFinanceTransaction(
  churchId: string,
  membership: ChurchMembership,
  tx: FinanceTransaction,
  settings?: FinanceSettings | null,
  overrideReason?: string,
): Promise<void> {
  assertBrowserOnline('Persetujuan transaksi keuangan');
  assertTenantContext(churchId, tx.churchId, membership);
  const check = canApproveTransaction(membership, tx, settings);
  if (!check.allowed) {
    throw new Error(check.reason || 'Tidak berhak menyetujui transaksi ini.');
  }

  const cleanOverride = (overrideReason || '').trim();
  if (check.requiresOwnerOverride && cleanOverride.length < 5) {
    throw new Error(
      'Owner yang menyetujui transaksinya sendiri wajib mengisi alasan override minimal 5 karakter.',
    );
  }

  const finalStatus = settings?.autoLockOnApproval === false ? 'approved' : 'locked';
  const deltas = computeApprovalBalanceDeltas(tx);

  try {
    await runTransaction(db, async (trx) => {
      const txRef = doc(db, 'churches', churchId, 'financeTransactions', tx.id);
      const txSnap = await trx.get(txRef);
      if (!txSnap.exists()) throw new Error('Transaksi tidak ditemukan.');
      const liveTx = txSnap.data() as FinanceTransaction;
      if (liveTx.status !== 'submitted') {
        throw new Error('Transaksi ini sudah diproses oleh pengguna lain.');
      }
      if (detectVersionConflict(tx.version, liveTx.version)) {
        throw new Error(
          'Konflik versi: transaksi telah diubah oleh pengguna lain sebelum disetujui. Muat ulang daftar persetujuan.',
        );
      }

      const accountSnaps = [];
      for (const item of deltas) {
        const accRef = doc(db, 'churches', churchId, 'financeAccounts', item.accountId);
        const accSnap = await trx.get(accRef);
        if (!accSnap.exists()) throw new Error('Akun kas terkait tidak ditemukan.');
        accountSnaps.push({ref: accRef, data: accSnap.data() as FinanceAccount, delta: item.delta});
      }

      const now = serverTimestamp();
      for (const acc of accountSnaps) {
        trx.update(acc.ref, {
          currentBalance: acc.data.currentBalance + acc.delta,
          updatedBy: membership.uid,
          updatedAt: now,
        });
      }

      trx.update(txRef, {
        status: finalStatus,
        approvedBy: membership.uid,
        approvedByEmail: membership.email,
        approvedAt: now,
        ...(finalStatus === 'locked' ? {lockedAt: now} : {}),
        ...(check.requiresOwnerOverride ? {overrideReason: cleanOverride.slice(0, 400)} : {}),
        version: (liveTx.version ?? 1) + 1,
        updatedAt: now,
      });
    });

    const viewerUids = await resolveViewerUids(churchId, membership);
    await appendFinanceAuditLog(churchId, membership, viewerUids, {
      action: check.requiresOwnerOverride ? 'finance.tx_owner_self_approved' : 'finance.tx_approved',
      targetType: 'financeTransaction',
      targetId: tx.id,
      txCode: tx.txCode,
      summary: `Transaksi ${tx.txCode} disetujui (${finalStatus}) dan saldo akun diperbarui secara transaksional.${
        check.requiresOwnerOverride ? ` Alasan override Owner: ${cleanOverride}` : ''
      }`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `churches/${churchId}/financeTransactions/${tx.id}`);
  }
}

export async function rejectFinanceTransaction(
  churchId: string,
  membership: ChurchMembership,
  tx: FinanceTransaction,
  rejectionReason: string,
): Promise<void> {
  assertBrowserOnline('Penolakan transaksi keuangan');
  assertTenantContext(churchId, tx.churchId, membership);
  if (!canRejectTransaction(membership, tx)) {
    throw new Error('Anda tidak memiliki izin finance.reject atau transaksi tidak sedang menunggu persetujuan.');
  }
  const cleanReason = rejectionReason.trim();
  if (cleanReason.length < 3) {
    throw new Error('Alasan penolakan wajib diisi minimal 3 karakter.');
  }

  try {
    await runTransaction(db, async (trx) => {
      const txRef = doc(db, 'churches', churchId, 'financeTransactions', tx.id);
      const txSnap = await trx.get(txRef);
      if (!txSnap.exists()) throw new Error('Transaksi tidak ditemukan.');
      const liveTx = txSnap.data() as FinanceTransaction;
      if (liveTx.status !== 'submitted') {
        throw new Error('Transaksi ini sudah diproses oleh pengguna lain.');
      }
      if (detectVersionConflict(tx.version, liveTx.version)) {
        throw new Error('Konflik versi: transaksi telah diubah oleh pengguna lain.');
      }
      const now = serverTimestamp();
      trx.update(txRef, {
        status: 'rejected',
        rejectedBy: membership.uid,
        rejectedAt: now,
        rejectionReason: cleanReason.slice(0, 400),
        version: (liveTx.version ?? 1) + 1,
        updatedAt: now,
      });
    });

    const viewerUids = await resolveViewerUids(churchId, membership);
    await appendFinanceAuditLog(churchId, membership, viewerUids, {
      action: 'finance.tx_rejected',
      targetType: 'financeTransaction',
      targetId: tx.id,
      txCode: tx.txCode,
      summary: `Transaksi ${tx.txCode} ditolak: ${cleanReason}`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `churches/${churchId}/financeTransactions/${tx.id}`);
  }
}

export async function voidFinanceTransaction(
  churchId: string,
  membership: ChurchMembership,
  tx: FinanceTransaction,
  voidReason: string,
): Promise<void> {
  assertBrowserOnline('Pembatalan (void) transaksi keuangan');
  assertTenantContext(churchId, tx.churchId, membership);
  if (!canVoidTransaction(membership, tx)) {
    throw new Error('Anda tidak memiliki izin finance.void atau transaksi belum disetujui.');
  }
  const cleanReason = voidReason.trim();
  if (cleanReason.length < 3) {
    throw new Error('Alasan pembatalan (void) wajib diisi minimal 3 karakter.');
  }

  const deltas = computeVoidBalanceDeltas(tx);

  try {
    await runTransaction(db, async (trx) => {
      const txRef = doc(db, 'churches', churchId, 'financeTransactions', tx.id);
      const txSnap = await trx.get(txRef);
      if (!txSnap.exists()) throw new Error('Transaksi tidak ditemukan.');
      const liveTx = txSnap.data() as FinanceTransaction;
      if (liveTx.status !== 'approved' && liveTx.status !== 'locked') {
        throw new Error('Hanya transaksi berstatus disetujui/terkunci yang dapat dibatalkan (void).');
      }
      if (detectVersionConflict(tx.version, liveTx.version)) {
        throw new Error(
          'Konflik versi: transaksi ini baru saja berubah status oleh pengguna lain.',
        );
      }

      const accountSnaps = [];
      for (const item of deltas) {
        const accRef = doc(db, 'churches', churchId, 'financeAccounts', item.accountId);
        const accSnap = await trx.get(accRef);
        if (!accSnap.exists()) throw new Error('Akun kas terkait tidak ditemukan.');
        accountSnaps.push({ref: accRef, data: accSnap.data() as FinanceAccount, delta: item.delta});
      }

      const now = serverTimestamp();
      for (const acc of accountSnaps) {
        trx.update(acc.ref, {
          currentBalance: acc.data.currentBalance + acc.delta,
          updatedBy: membership.uid,
          updatedAt: now,
        });
      }

      trx.update(txRef, {
        status: 'voided',
        voidedBy: membership.uid,
        voidedAt: now,
        voidReason: cleanReason.slice(0, 400),
        version: (liveTx.version ?? 1) + 1,
        updatedAt: now,
      });
    });

    const viewerUids = await resolveViewerUids(churchId, membership);
    await appendFinanceAuditLog(churchId, membership, viewerUids, {
      action: 'finance.tx_voided',
      targetType: 'financeTransaction',
      targetId: tx.id,
      txCode: tx.txCode,
      summary: `Transaksi ${tx.txCode} dibatalkan (void) dan dampak saldo dibalikkan. Alasan: ${cleanReason}`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `churches/${churchId}/financeTransactions/${tx.id}`);
  }
}

// ============================================================
// PRIVATE RECEIPTS & ATTACHMENTS (Firebase Storage, Ephemeral Access)
// ============================================================

export async function uploadFinanceReceipt(
  churchId: string,
  membership: ChurchMembership,
  tx: FinanceTransaction,
  file: File,
): Promise<FinanceAttachment> {
  assertBrowserOnline('Unggah bukti transaksi');
  assertTenantContext(churchId, tx.churchId, membership);
  if (
    !hasFinancePermission(membership, 'finance.create') &&
    !hasFinancePermission(membership, 'finance.editDraft')
  ) {
    throw new Error('Anda tidak memiliki izin untuk mengunggah bukti transaksi.');
  }
  if (tx.status !== 'draft' && tx.status !== 'submitted' && tx.status !== 'rejected') {
    throw new Error('Bukti hanya dapat ditambahkan pada transaksi draf atau menunggu persetujuan.');
  }
  if (!ALLOWED_RECEIPT_MIME.has(file.type)) {
    throw new Error('Format bukti harus JPG, PNG, WebP, atau PDF.');
  }
  if (file.size > MAX_RECEIPT_BYTES) {
    throw new Error('Ukuran file bukti maksimal 5 MB.');
  }

  const attId = generateId('rcp');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const storagePath = `churches/${churchId}/finance/${tx.id}/${attId}-${safeName}`;
  const storageRef = ref(storage, storagePath);

  await uploadBytes(storageRef, file, {
    contentType: file.type,
    customMetadata: {
      churchId,
      txId: tx.id,
      txCode: tx.txCode,
      uploadedBy: membership.uid,
    },
  });

  const attachment: FinanceAttachment = {
    id: attId,
    name: file.name.slice(0, 120),
    storagePath,
    contentType: file.type,
    sizeBytes: file.size,
    uploadedAt: new Date().toISOString(),
    uploadedBy: membership.uid,
  };

  const nextAttachments = [...(tx.attachments || []), attachment].slice(0, 10);

  try {
    await updateDoc(doc(db, 'churches', churchId, 'financeTransactions', tx.id), {
      attachments: nextAttachments,
      updatedAt: serverTimestamp(),
    });
    const viewerUids = await resolveViewerUids(churchId, membership);
    await appendFinanceAuditLog(churchId, membership, viewerUids, {
      action: 'finance.receipt_uploaded',
      targetType: 'financeTransaction',
      targetId: tx.id,
      txCode: tx.txCode,
      summary: `Bukti transaksi "${attachment.name}" diunggah untuk ${tx.txCode}.`,
    });
    return attachment;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `churches/${churchId}/financeTransactions/${tx.id}`);
  }
}

export async function fetchPrivateReceiptBlob(
  churchId: string,
  membership: ChurchMembership,
  tx: FinanceTransaction,
  attachment: FinanceAttachment,
): Promise<Blob> {
  assertTenantContext(churchId, tx.churchId, membership);
  if (!hasFinancePermission(membership, 'finance.viewReceipts')) {
    throw new Error('Akses ditolak: Anda tidak memiliki izin finance.viewReceipts.');
  }

  const bytes = await getBytes(ref(storage, attachment.storagePath));
  const viewerUids = await resolveViewerUids(churchId, membership);
  await appendFinanceAuditLog(churchId, membership, viewerUids, {
    action: 'finance.receipt_viewed',
    targetType: 'financeTransaction',
    targetId: tx.id,
    txCode: tx.txCode,
    summary: `Bukti transaksi "${attachment.name}" (${tx.txCode}) dibuka secara privat.`,
  });
  return new Blob([bytes], {type: attachment.contentType || 'application/octet-stream'});
}

export async function deleteFinanceReceipt(
  churchId: string,
  membership: ChurchMembership,
  tx: FinanceTransaction,
  attachment: FinanceAttachment,
): Promise<void> {
  assertBrowserOnline('Penghapusan bukti transaksi');
  assertTenantContext(churchId, tx.churchId, membership);
  if (!hasFinancePermission(membership, 'finance.editDraft')) {
    throw new Error('Anda tidak memiliki izin finance.editDraft untuk menghapus bukti.');
  }
  if (tx.status !== 'draft' && tx.status !== 'rejected') {
    throw new Error('Hanya bukti pada transaksi draf atau ditolak yang dapat dihapus.');
  }

  try {
    await deleteObject(ref(storage, attachment.storagePath)).catch(() => undefined);
    const nextAttachments = (tx.attachments || []).filter((a) => a.id !== attachment.id);
    await updateDoc(doc(db, 'churches', churchId, 'financeTransactions', tx.id), {
      attachments: nextAttachments,
      updatedAt: serverTimestamp(),
    });
    const viewerUids = await resolveViewerUids(churchId, membership);
    await appendFinanceAuditLog(churchId, membership, viewerUids, {
      action: 'finance.receipt_deleted',
      targetType: 'financeTransaction',
      targetId: tx.id,
      txCode: tx.txCode,
      summary: `Bukti transaksi "${attachment.name}" dihapus dari draf ${tx.txCode}.`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `churches/${churchId}/financeTransactions/${tx.id}`);
  }
}

// ============================================================
// SETTINGS & EXPORT AUDIT
// ============================================================

export async function upsertFinanceSettings(
  churchId: string,
  membership: ChurchMembership,
  input: {
    requireReceiptAboveAmount: number | string;
    allowOwnerSelfApproveOverride: boolean;
    autoLockOnApproval: boolean;
    defaultPaymentMethod: FinancePaymentMethod;
    fiscalLockBeforeDate?: string;
  },
): Promise<void> {
  assertBrowserOnline('Penyimpanan pengaturan kontrol keuangan');
  assertTenantContext(churchId, churchId, membership);
  if (!hasFinancePermission(membership, 'finance.manageSettings')) {
    throw new Error('Anda tidak memiliki izin finance.manageSettings.');
  }

  const thresholdCheck = validateSafeIntegerAmount(input.requireReceiptAboveAmount, true);
  if (!thresholdCheck.valid) {
    throw new Error(thresholdCheck.error);
  }
  const lockDate = (input.fiscalLockBeforeDate || '').trim();
  if (lockDate && !/^\d{4}-\d{2}-\d{2}$/.test(lockDate)) {
    throw new Error('Tanggal kunci periode fiskal harus berformat YYYY-MM-DD.');
  }

  const viewerUids = await resolveViewerUids(churchId, membership);
  const payload = {
    churchId,
    ownerUid: membership.ownerUid,
    requireReceiptAboveAmount: thresholdCheck.value,
    allowOwnerSelfApproveOverride: Boolean(input.allowOwnerSelfApproveOverride),
    autoLockOnApproval: Boolean(input.autoLockOnApproval),
    defaultPaymentMethod: input.defaultPaymentMethod,
    fiscalLockBeforeDate: lockDate,
    authorizedViewerUids: viewerUids,
    updatedBy: membership.uid,
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'churches', churchId, 'financeSettings', 'general'), payload, {
      merge: true,
    });
    await appendFinanceAuditLog(churchId, membership, viewerUids, {
      action: 'finance.settings_updated',
      targetType: 'financeSettings',
      targetId: 'general',
      summary: `Pengaturan kontrol keuangan diperbarui (wajib bukti > ${thresholdCheck.value}, autoLock=${Boolean(input.autoLockOnApproval)}).`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `churches/${churchId}/financeSettings/general`);
  }
}

export async function recordFinanceExportAudit(
  churchId: string,
  membership: ChurchMembership,
  format: 'pdf' | 'xlsx' | 'csv',
  reportTitle: string,
  rowCount: number,
): Promise<void> {
  assertTenantContext(churchId, churchId, membership);
  if (!hasFinancePermission(membership, 'finance.export')) {
    throw new Error('Anda tidak memiliki izin finance.export untuk mengekspor laporan.');
  }
  const viewerUids = await resolveViewerUids(churchId, membership);
  await appendFinanceAuditLog(churchId, membership, viewerUids, {
    action: `finance.export_${format}`,
    targetType: 'financeReport',
    targetId: churchId,
    summary: `Laporan keuangan "${reportTitle}" (${rowCount} baris) diekspor sebagai ${format.toUpperCase()}.`,
  });
}
