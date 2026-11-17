import {createHash} from 'node:crypto';
import {onCall, HttpsError} from 'firebase-functions/v2/https';
import {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentWritten,
} from 'firebase-functions/v2/firestore';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import {FieldValue, getFirestore} from 'firebase-admin/firestore';

admin.initializeApp();

const DATABASE_ID =
  process.env.FIRESTORE_DATABASE_ID ||
  'ai-studio-remixhigayonchur-6ad234a1-b5ec-466f-b61f-00dc3d1a78cd';
const db = getFirestore(DATABASE_ID);

/**
 * Trusted server-side helper to verify active church ownership before sensitive operations.
 */
async function assertChurchOwner(churchId: string, uid: string): Promise<void> {
  if (!churchId || !uid) {
    throw new HttpsError('unauthenticated', 'Autentikasi tidak valid.');
  }
  const membershipSnap = await db
    .collection('churches')
    .doc(churchId)
    .collection('memberships')
    .doc(uid)
    .get();

  if (!membershipSnap.exists) {
    throw new HttpsError('permission-denied', 'Anda bukan anggota gereja ini.');
  }

  const membership = membershipSnap.data();
  if (membership?.status !== 'active' || membership?.role !== 'owner') {
    throw new HttpsError(
      'permission-denied',
      'Operasi sensitif ini hanya diizinkan untuk Church Owner yang aktif.',
    );
  }
}

/**
 * Callable Function: Verify and revoke a user's access across church workspace.
 */
export const revokeChurchMembership = onCall(async (request) => {
  if (!request.auth || !request.auth.token.email_verified) {
    throw new HttpsError('unauthenticated', 'Email harus terverifikasi.');
  }

  const {churchId, targetUid, reason} = request.data as {
    churchId?: string;
    targetUid?: string;
    reason?: string;
  };

  if (!churchId || !targetUid || targetUid === request.auth.uid) {
    throw new HttpsError('invalid-argument', 'Parameter pencabutan akses tidak valid.');
  }

  await assertChurchOwner(churchId, request.auth.uid);

  const batch = db.batch();
  const membershipRef = db
    .collection('churches')
    .doc(churchId)
    .collection('memberships')
    .doc(targetUid);
  const userChurchRef = db
    .collection('userChurchRefs')
    .doc(targetUid)
    .collection('churches')
    .doc(churchId);
  const auditRef = db.collection('churches').doc(churchId).collection('auditLogs').doc();

  const now = FieldValue.serverTimestamp();
  batch.update(membershipRef, {
    status: 'revoked',
    financePermissions: [],
    staffPermissions: [],
    updatedAt: now,
  });
  batch.update(userChurchRef, {
    status: 'revoked',
    updatedAt: now,
  });
  batch.set(auditRef, {
    id: auditRef.id,
    churchId,
    ownerUid: request.auth.uid,
    actorUid: request.auth.uid,
    actorEmail: request.auth.token.email || '',
    actorRole: 'owner',
    action: 'membership.revoked_server',
    targetType: 'membership',
    targetId: targetUid,
    summary: `Akses pengguna ${targetUid} dicabut secara aman${reason ? `: ${String(reason).slice(0, 120)}` : ''}.`,
    createdAt: now,
  });

  await batch.commit();
  return {success: true, databaseId: DATABASE_ID};
});

/**
 * Callable Function: Complete multi-step Ownership Transfer safely on server.
 * Only active Owner can finalize an accepted transfer request.
 */
export const completeChurchOwnershipTransfer = onCall(async (request) => {
  if (!request.auth || !request.auth.token.email_verified) {
    throw new HttpsError('unauthenticated', 'Email harus terverifikasi.');
  }

  const {churchId, transferId} = request.data as {
    churchId?: string;
    transferId?: string;
  };

  if (!churchId || !transferId) {
    throw new HttpsError('invalid-argument', 'Parameter pemindahan kepemilikan tidak lengkap.');
  }

  await assertChurchOwner(churchId, request.auth.uid);

  const churchRef = db.collection('churches').doc(churchId);
  const transferRef = churchRef.collection('ownershipTransfers').doc(transferId);

  const [churchSnap, transferSnap] = await Promise.all([churchRef.get(), transferRef.get()]);
  if (!churchSnap.exists || !transferSnap.exists) {
    throw new HttpsError('not-found', 'Gereja atau permintaan pemindahan kepemilikan tidak ditemukan.');
  }

  const transfer = transferSnap.data()!;
  if (transfer.status !== 'accepted') {
    throw new HttpsError(
      'failed-precondition',
      'Permintaan transfer belum disetujui oleh penerima.',
    );
  }
  if (transfer.fromUid !== request.auth.uid) {
    throw new HttpsError('permission-denied', 'Anda bukan pengirim permintaan transfer ini.');
  }

  const toUid = String(transfer.toUid);
  const fromUid = String(transfer.fromUid);
  const targetMembershipRef = churchRef.collection('memberships').doc(toUid);
  const targetMembershipSnap = await targetMembershipRef.get();
  if (!targetMembershipSnap.exists || targetMembershipSnap.data()?.status !== 'active') {
    throw new HttpsError('failed-precondition', 'Akun penerima tidak lagi aktif di gereja ini.');
  }

  const now = FieldValue.serverTimestamp();
  const churchData = churchSnap.data()!;
  const tenantCollections = [
    'settings',
    'memberships',
    'congregationMembers',
    'familyGroups',
    'congregationActivities',
    'financeAccounts',
    'financeCategories',
    'financeTransactions',
    'financeSettings',
    'financeAuditLogs',
    'backups',
  ];

  // Update root church + memberships + userChurchRefs + transfer status first
  let batch = db.batch();
  let opCount = 0;

  const commitIfFull = async () => {
    if (opCount >= 400) {
      await batch.commit();
      batch = db.batch();
      opCount = 0;
    }
  };

  batch.update(churchRef, {ownerId: toUid, updatedAt: now});
  batch.update(targetMembershipRef, {
    role: 'owner',
    ownerUid: toUid,
    financePermissions: [],
    staffPermissions: ['dashboard:basic', 'church:view_profile'],
    updatedAt: now,
  });
  batch.update(churchRef.collection('memberships').doc(fromUid), {
    role: 'church_staff',
    ownerUid: toUid,
    financePermissions: [],
    staffPermissions: ['dashboard:basic', 'church:view_profile'],
    updatedAt: now,
  });
  batch.update(
    db.collection('userChurchRefs').doc(toUid).collection('churches').doc(churchId),
    {role: 'owner', updatedAt: now},
  );
  batch.update(
    db.collection('userChurchRefs').doc(fromUid).collection('churches').doc(churchId),
    {role: 'church_staff', updatedAt: now},
  );
  batch.update(transferRef, {status: 'completed', ownerUid: toUid, updatedAt: now});
  opCount += 6;

  // Migrate ownerUid across all church subcollections for seamless rules & isolation
  for (const colName of tenantCollections) {
    const snap = await churchRef.collection(colName).get();
    for (const d of snap.docs) {
      if (colName === 'memberships' && (d.id === toUid || d.id === fromUid)) {
        continue;
      }
      batch.update(d.ref, {ownerUid: toUid});
      opCount++;
      await commitIfFull();
    }
  }

  const auditRef = churchRef.collection('auditLogs').doc();
  batch.set(auditRef, {
    id: auditRef.id,
    churchId,
    ownerUid: toUid,
    actorUid: fromUid,
    actorEmail: request.auth.token.email || '',
    actorRole: 'owner',
    action: 'church.ownership_transferred',
    targetType: 'church',
    targetId: churchId,
    summary: `Kepemilikan gereja "${churchData.name || churchId}" dipindahkan dari ${transfer.fromEmail} ke ${transfer.toEmail}.`,
    createdAt: now,
  });

  await batch.commit();
  return {success: true, newOwnerUid: toUid, databaseId: DATABASE_ID};
});

/**
 * Callable Function: Trusted server-side verification & audit log for sensitive Congregation actions
 * (import, export, attachment access, unauthorized probe logging).
 * Strictly enforces active Church Owner on the server; never returns or logs full member PII.
 */
export const logCongregationSensitiveAction = onCall(async (request) => {
  if (!request.auth || !request.auth.token.email_verified) {
    throw new HttpsError('unauthenticated', 'Email harus terverifikasi.');
  }

  const {churchId, action, targetId, summary} = request.data as {
    churchId?: string;
    action?: string;
    targetId?: string;
    summary?: string;
  };

  if (!churchId || !action || !summary) {
    throw new HttpsError('invalid-argument', 'Parameter audit jemaat tidak lengkap.');
  }

  await assertChurchOwner(churchId, request.auth.uid);

  const now = FieldValue.serverTimestamp();
  const auditRef = db.collection('churches').doc(churchId).collection('auditLogs').doc();
  const activityRef = db
    .collection('churches')
    .doc(churchId)
    .collection('congregationActivities')
    .doc();

  const safeSummary = String(summary).slice(0, 350);
  const safeAction = String(action).slice(0, 80);
  const safeTargetId = String(targetId || churchId).slice(0, 128);

  const batch = db.batch();
  batch.set(auditRef, {
    id: auditRef.id,
    churchId,
    ownerUid: request.auth.uid,
    actorUid: request.auth.uid,
    actorEmail: request.auth.token.email || '',
    actorRole: 'owner',
    action: safeAction,
    targetType: 'congregation',
    targetId: safeTargetId,
    summary: safeSummary,
    createdAt: now,
  });
  batch.set(activityRef, {
    id: activityRef.id,
    churchId,
    ownerUid: request.auth.uid,
    memberId: safeTargetId,
    memberCode: '',
    action: safeAction,
    summary: safeSummary,
    actorUid: request.auth.uid,
    actorEmail: request.auth.token.email || '',
    createdAt: now,
  });

  await batch.commit();
  return {verifiedOwner: true};
});

/**
 * Scheduled Cloud Function: Daily automated encrypted-at-rest JSON backup for churches
 * that opt in via settings/general.automatedBackupEnabled == true.
 */
export const scheduledDailyChurchBackups = onSchedule(
  {schedule: 'every day 02:00', timeZone: 'Asia/Jakarta'},
  async () => {
    const churchesSnap = await db
      .collection('churches')
      .where('status', '==', 'active')
      .get();

    const bucket = admin.storage().bucket();

    for (const churchDoc of churchesSnap.docs) {
      const churchId = churchDoc.id;
      const churchData = churchDoc.data();
      const generalSnap = await churchDoc.ref.collection('settings').doc('general').get();
      if (!generalSnap.exists || generalSnap.data()?.automatedBackupEnabled !== true) {
        continue;
      }

      const [
        settingsSnap,
        membershipsSnap,
        auditLogsSnap,
        membersSnap,
        familiesSnap,
        activitiesSnap,
        accountsSnap,
        categoriesSnap,
        transactionsSnap,
        finSettingsSnap,
        finAuditSnap,
      ] = await Promise.all([
        churchDoc.ref.collection('settings').get(),
        churchDoc.ref.collection('memberships').get(),
        churchDoc.ref.collection('auditLogs').get(),
        churchDoc.ref.collection('congregationMembers').get(),
        churchDoc.ref.collection('familyGroups').get(),
        churchDoc.ref.collection('congregationActivities').get(),
        churchDoc.ref.collection('financeAccounts').get(),
        churchDoc.ref.collection('financeCategories').get(),
        churchDoc.ref.collection('financeTransactions').get(),
        churchDoc.ref.collection('financeSettings').get(),
        churchDoc.ref.collection('financeAuditLogs').get(),
      ]);

      const backupId = `bkp-auto-${Date.now()}`;
      const body = {
        format: 'higayon-church-backup-v1' as const,
        backupId,
        churchId,
        ownerUid: churchData.ownerId,
        scope: 'full' as const,
        backupType: 'scheduled' as const,
        createdAtIso: new Date().toISOString(),
        createdBy: churchData.ownerId,
        checksumAlgorithm: 'SHA-256' as const,
        collections: {
          church: churchData,
          settings: settingsSnap.docs.map((d) => d.data()),
          memberships: membershipsSnap.docs.map((d) => d.data()),
          auditLogs: auditLogsSnap.docs.map((d) => d.data()),
          congregationMembers: membersSnap.docs.map((d) => d.data()),
          familyGroups: familiesSnap.docs.map((d) => d.data()),
          congregationActivities: activitiesSnap.docs.map((d) => d.data()),
          financeAccounts: accountsSnap.docs.map((d) => d.data()),
          financeCategories: categoriesSnap.docs.map((d) => d.data()),
          financeTransactions: transactionsSnap.docs.map((d) => d.data()),
          financeSettings: finSettingsSnap.docs.map((d) => d.data()),
          financeAuditLogs: finAuditSnap.docs.map((d) => d.data()),
        },
        attachmentManifest: {
          congregationPaths: [] as string[],
          financeReceiptPaths: [] as string[],
        },
      };

      const checksum = createHash('sha256').update(JSON.stringify(body), 'utf8').digest('hex');
      const fullArchive = {...body, checksum};
      const serialized = JSON.stringify(fullArchive, null, 2);
      const sizeBytes = Buffer.byteLength(serialized, 'utf8');
      const storagePath = `churches/${churchId}/backups/${backupId}.json`;

      await bucket.file(storagePath).save(serialized, {
        contentType: 'application/json',
        metadata: {
          metadata: {
            churchId,
            ownerUid: String(churchData.ownerId),
            checksum,
            backupType: 'scheduled',
          },
        },
      });

      const now = FieldValue.serverTimestamp();
      const batch = db.batch();
      batch.set(churchDoc.ref.collection('backups').doc(backupId), {
        id: backupId,
        churchId,
        ownerUid: churchData.ownerId,
        createdBy: churchData.ownerId,
        scope: 'full',
        backupType: 'scheduled',
        checksum,
        sizeBytes,
        storagePath,
        recordSummary: {
          members: membersSnap.size,
          families: familiesSnap.size,
          accounts: accountsSnap.size,
          categories: categoriesSnap.size,
          transactions: transactionsSnap.size,
          auditLogs: auditLogsSnap.size + finAuditSnap.size,
        },
        status: 'completed',
        createdAt: now,
      });

      const auditRef = churchDoc.ref.collection('auditLogs').doc();
      batch.set(auditRef, {
        id: auditRef.id,
        churchId,
        ownerUid: churchData.ownerId,
        actorUid: 'system_scheduler',
        actorEmail: 'scheduler@higayon.local',
        actorRole: 'owner',
        action: 'backup.scheduled_completed',
        targetType: 'backup',
        targetId: backupId,
        summary: `Backup otomatis harian berhasil dibuat (SHA-256: ${checksum.slice(0, 12)}...).`,
        createdAt: now,
      });

      await batch.commit();
    }
  },
);

/**
 * Trigger: Server-side audit safeguard for Congregation Member writes.
 * Deliberately omits personal fields (address, phone, notes) from logs.
 */
export const onCongregationMemberWritten = onDocumentWritten(
  {document: 'churches/{churchId}/congregationMembers/{memberId}', database: DATABASE_ID},
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after) return;

    const action = !before
      ? 'congregation.member_created_verified'
      : !before.archived && after.archived
        ? 'congregation.member_archived_verified'
        : before.archived && !after.archived
          ? 'congregation.member_restored_verified'
          : 'congregation.member_updated_verified';

    const auditRef = db
      .collection('churches')
      .doc(event.params.churchId)
      .collection('auditLogs')
      .doc();

    await auditRef.set({
      id: auditRef.id,
      churchId: event.params.churchId,
      ownerUid: after.ownerUid,
      actorUid: after.updatedBy || after.ownerUid,
      actorEmail: 'verified-owner@higayon.local',
      actorRole: 'owner',
      action,
      targetType: 'congregationMember',
      targetId: event.params.memberId,
      summary: `Verifikasi server untuk kode anggota ${after.memberCode} (status: ${after.status}).`,
      createdAt: FieldValue.serverTimestamp(),
    });
  },
);

/**
 * Trigger: Audit trail safeguard whenever a church membership role or permission changes.
 */
export const onMembershipRoleUpdated = onDocumentUpdated(
  {document: 'churches/{churchId}/memberships/{uid}', database: DATABASE_ID},
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    const roleChanged = before.role !== after.role;
    const statusChanged = before.status !== after.status;
    if (!roleChanged && !statusChanged) return;

    const auditRef = db
      .collection('churches')
      .doc(event.params.churchId)
      .collection('auditLogs')
      .doc();

    await auditRef.set({
      id: auditRef.id,
      churchId: event.params.churchId,
      ownerUid: after.ownerUid,
      actorUid: 'system_function',
      actorEmail: 'system@higayon.local',
      actorRole: 'owner',
      action: 'membership.governance_verified',
      targetType: 'membership',
      targetId: event.params.uid,
      summary: `Perubahan keanggotaan terverifikasi (${before.role}/${before.status} -> ${after.role}/${after.status}).`,
      createdAt: FieldValue.serverTimestamp(),
    });
  },
);

/**
 * Trigger: Safe invitation notification hook.
 * SECURITY MANDATE: Never include congregation details or financial balances in emails/notifications.
 */
export const onInvitationCreated = onDocumentCreated(
  {document: 'churchInvitations/{inviteId}', database: DATABASE_ID},
  async (event) => {
    const invite = event.data?.data();
    if (!invite) return;

    console.info(
      'Safe invitation envelope prepared:',
      JSON.stringify({
        churchId: invite.churchId,
        inviteId: event.params.inviteId,
        role: invite.role,
      }),
    );
  },
);

/**
 * Trigger: Automatically synchronize authorizedViewerUids across church finance documents
 * whenever a membership role, status, or financePermissions array changes.
 */
export const onMembershipFinanceSync = onDocumentWritten(
  {document: 'churches/{churchId}/memberships/{uid}', database: DATABASE_ID},
  async (event) => {
    const churchId = event.params.churchId;
    const membersSnap = await db
      .collection('churches')
      .doc(churchId)
      .collection('memberships')
      .where('status', '==', 'active')
      .get();

    const viewerUids = new Set<string>();
    for (const docSnap of membersSnap.docs) {
      const m = docSnap.data();
      if (m.role === 'owner') {
        viewerUids.add(m.uid);
      } else if (
        (m.role === 'finance_manager' || m.role === 'finance_staff') &&
        Array.isArray(m.financePermissions) &&
        m.financePermissions.length > 0
      ) {
        viewerUids.add(m.uid);
      }
    }

    const viewerArray = Array.from(viewerUids).slice(0, 50);
    const collections = [
      'financeAccounts',
      'financeCategories',
      'financeTransactions',
      'financeSettings',
      'financeAuditLogs',
    ];

    const batch = db.batch();
    let opCount = 0;
    for (const colName of collections) {
      const colSnap = await db.collection('churches').doc(churchId).collection(colName).get();
      for (const docSnap of colSnap.docs) {
        batch.update(docSnap.ref, {authorizedViewerUids: viewerArray});
        opCount++;
        if (opCount >= 450) break;
      }
      if (opCount >= 450) break;
    }

    if (opCount > 0) {
      await batch.commit();
    }
  },
);

/**
 * Trigger: Server-side audit safeguard for financial transaction approvals and voids.
 */
export const onFinanceTransactionWritten = onDocumentWritten(
  {document: 'churches/{churchId}/financeTransactions/{transactionId}', database: DATABASE_ID},
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after) return;

    if (!before || before.status !== after.status) {
      const auditRef = db
        .collection('churches')
        .doc(event.params.churchId)
        .collection('financeAuditLogs')
        .doc();

      await auditRef.set({
        id: auditRef.id,
        churchId: event.params.churchId,
        ownerUid: after.ownerUid,
        action: `finance.tx_status_${after.status}`,
        targetType: 'financeTransaction',
        targetId: event.params.transactionId,
        txCode: after.txCode || '',
        summary: `Status transaksi ${after.txCode || event.params.transactionId} (${after.type}) tercatat: ${after.status}.`,
        actorUid:
          after.approvedBy ||
          after.voidedBy ||
          after.rejectedBy ||
          after.submittedBy ||
          after.createdBy ||
          after.ownerUid,
        actorEmail: after.approvedByEmail || after.createdByEmail || 'system@higayon.local',
        actorRole: 'owner',
        authorizedViewerUids: Array.isArray(after.authorizedViewerUids)
          ? after.authorizedViewerUids.slice(0, 50)
          : [],
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  },
);
