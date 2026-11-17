import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {deleteObject, getBytes, ref, uploadBytes} from 'firebase/storage';
import {db, storage} from '../firebase';
import {
  assertCongregationOwner,
  DEFAULT_REQUIRED_FIELDS,
  generateSequentialCode,
  type MemberFormInput,
  type ParsedImportRow,
  validateMemberForm,
} from '../domain/congregation';
import {isValidFirestoreId} from '../domain/validation';
import type {
  ChurchMembership,
  CongregationActivity,
  CongregationAttachment,
  CongregationMember,
  CongregationMemberStatus,
  CongregationRequiredField,
  FamilyGroup,
  FamilyRole,
} from '../types/domain';
import {handleFirestoreError, OperationType} from '../utils/firestoreErrors';
import {assertBrowserOnline} from '../utils/networkGuard';
import {detectVersionConflict} from '../domain/backup';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_ATTACHMENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

function generateSecureId(prefix: string): string {
  const rand =
    typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 14)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}-${rand}`;
}

function toTimestampSeconds(ts: unknown): number {
  if (!ts || typeof ts !== 'object') return 0;
  if ('seconds' in ts && typeof (ts as {seconds: number}).seconds === 'number') {
    return (ts as {seconds: number}).seconds;
  }
  return 0;
}

function buildMemberWriteFields(
  input: MemberFormInput,
  familyGroupName: string,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    fullName: input.fullName.trim(),
    nickname: (input.nickname || '').trim(),
    gender: input.gender || '',
    birthDate: (input.birthDate || '').trim(),
    phone: (input.phone || '').trim(),
    email: (input.email || '').trim().toLowerCase(),
    address: (input.address || '').trim(),
    emergencyContactName: (input.emergencyContactName || '').trim(),
    emergencyContactPhone: (input.emergencyContactPhone || '').trim(),
    emergencyContactRelation: (input.emergencyContactRelation || '').trim(),
    joinedDate: (input.joinedDate || '').trim(),
    status: input.status,
    familyGroupId: (input.familyGroupId || '').trim(),
    familyGroupName: familyGroupName.trim(),
    familyRole: input.familyGroupId ? input.familyRole || 'other' : '',
    donorRefCode: (input.donorRefCode || '').trim(),
    adminNotes: (input.adminNotes || '').trim(),
  };
  return payload;
}

function appendActivityAndAudit(
  batch: ReturnType<typeof writeBatch>,
  churchId: string,
  membership: ChurchMembership,
  params: {
    memberId?: string;
    memberCode?: string;
    action: string;
    targetType: string;
    targetId: string;
    summary: string;
  },
  now: unknown,
): void {
  const actId = generateSecureId('act');
  const logId = generateSecureId('log');

  const activityDoc: Record<string, unknown> = {
    id: actId,
    churchId,
    ownerUid: membership.ownerUid,
    action: params.action,
    summary: params.summary.slice(0, 400),
    actorUid: membership.uid,
    actorEmail: membership.email,
    createdAt: now,
  };
  if (params.memberId) activityDoc.memberId = params.memberId;
  if (params.memberCode) activityDoc.memberCode = params.memberCode;

  batch.set(doc(db, 'churches', churchId, 'congregationActivities', actId), activityDoc);

  batch.set(doc(db, 'churches', churchId, 'auditLogs', logId), {
    id: logId,
    churchId,
    ownerUid: membership.ownerUid,
    actorUid: membership.uid,
    actorEmail: membership.email,
    actorRole: membership.role,
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId,
    summary: params.summary.slice(0, 500),
    createdAt: now,
  });
}

// ============================================================================
// READ OPERATIONS (Strictly Owner-Only, Active Church Scoped)
// ============================================================================

export async function fetchCongregationMembers(
  activeChurchId: string,
  membership: ChurchMembership | null | undefined,
): Promise<CongregationMember[]> {
  assertCongregationOwner(activeChurchId, membership);
  const path = `churches/${activeChurchId}/congregationMembers`;
  try {
    const q = query(
      collection(db, 'churches', activeChurchId, 'congregationMembers'),
      where('ownerUid', '==', membership.ownerUid),
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as CongregationMember)
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'id'));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchFamilyGroups(
  activeChurchId: string,
  membership: ChurchMembership | null | undefined,
): Promise<FamilyGroup[]> {
  assertCongregationOwner(activeChurchId, membership);
  const path = `churches/${activeChurchId}/familyGroups`;
  try {
    const q = query(
      collection(db, 'churches', activeChurchId, 'familyGroups'),
      where('ownerUid', '==', membership.ownerUid),
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as FamilyGroup)
      .sort((a, b) => a.name.localeCompare(b.name, 'id'));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchCongregationActivities(
  activeChurchId: string,
  membership: ChurchMembership | null | undefined,
): Promise<CongregationActivity[]> {
  assertCongregationOwner(activeChurchId, membership);
  const path = `churches/${activeChurchId}/congregationActivities`;
  try {
    const q = query(
      collection(db, 'churches', activeChurchId, 'congregationActivities'),
      where('ownerUid', '==', membership.ownerUid),
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as CongregationActivity)
      .sort((a, b) => toTimestampSeconds(b.createdAt) - toTimestampSeconds(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchCongregationRequiredFields(
  activeChurchId: string,
  membership: ChurchMembership | null | undefined,
): Promise<CongregationRequiredField[]> {
  assertCongregationOwner(activeChurchId, membership);
  const path = `churches/${activeChurchId}/settings/congregation`;
  try {
    const snap = await getDoc(doc(db, 'churches', activeChurchId, 'settings', 'congregation'));
    if (snap.exists()) {
      const fields = snap.data()?.congregationRequiredFields;
      if (Array.isArray(fields) && fields.length > 0) {
        return fields as CongregationRequiredField[];
      }
    }
    return DEFAULT_REQUIRED_FIELDS;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function saveCongregationRequiredFields(
  activeChurchId: string,
  membership: ChurchMembership | null | undefined,
  fields: CongregationRequiredField[],
): Promise<CongregationRequiredField[]> {
  assertBrowserOnline('Penyimpanan kebijakan field jemaat');
  assertCongregationOwner(activeChurchId, membership);
  const normalized = Array.from(
    new Set<CongregationRequiredField>([...DEFAULT_REQUIRED_FIELDS, ...fields]),
  );

  const settingsRef = doc(db, 'churches', activeChurchId, 'settings', 'congregation');
  const now = serverTimestamp();

  try {
    const existing = await getDoc(settingsRef);
    if (existing.exists()) {
      await updateDoc(settingsRef, {
        congregationRequiredFields: normalized,
        updatedBy: membership.uid,
        updatedAt: now,
      });
    } else {
      await setDoc(settingsRef, {
        churchId: activeChurchId,
        ownerUid: membership.ownerUid,
        fiscalYearStartMonth: 1,
        requireMfaForFinanceApproval: true,
        requirePinForSensitiveActions: false,
        sessionTimeoutMinutes: 30,
        congregationRequiredFields: normalized,
        updatedBy: membership.uid,
        updatedAt: now,
      });
    }

    const batch = writeBatch(db);
    appendActivityAndAudit(
      batch,
      activeChurchId,
      membership,
      {
        action: 'congregation.required_fields_updated',
        targetType: 'settings',
        targetId: 'congregation',
        summary: `Kebijakan field wajib profil jemaat diperbarui (${normalized.length} field wajib).`,
      },
      now,
    );
    await batch.commit();
    return normalized;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `churches/${activeChurchId}/settings/congregation`);
  }
}

// ============================================================================
// MEMBER MUTATIONS (Create, Update, Status Change, Archive / Restore)
// ============================================================================

export async function createCongregationMember(
  activeChurchId: string,
  membership: ChurchMembership | null | undefined,
  input: MemberFormInput,
  requiredFields: readonly CongregationRequiredField[],
  existingMembers: readonly CongregationMember[],
  families: readonly FamilyGroup[],
): Promise<string> {
  assertBrowserOnline('Penambahan data jemaat');
  assertCongregationOwner(activeChurchId, membership);

  const validation = validateMemberForm(input, requiredFields);
  if (!validation.valid) {
    throw new Error(validation.errors[0]);
  }

  const memberId = generateSecureId('mbr');
  const memberCode = generateSequentialCode(
    'JMT',
    existingMembers.map((m) => m.memberCode),
  );
  const family = input.familyGroupId
    ? families.find((f) => f.id === input.familyGroupId)
    : undefined;
  const now = serverTimestamp();

  const payload = {
    id: memberId,
    churchId: activeChurchId,
    ownerUid: membership.ownerUid,
    memberCode,
    ...buildMemberWriteFields(input, family?.name || ''),
    attachments: [] as CongregationAttachment[],
    archived: false,
    version: 1,
    createdBy: membership.uid,
    updatedBy: membership.uid,
    createdAt: now,
    updatedAt: now,
  };

  const batch = writeBatch(db);
  batch.set(doc(db, 'churches', activeChurchId, 'congregationMembers', memberId), payload);
  appendActivityAndAudit(
    batch,
    activeChurchId,
    membership,
    {
      memberId,
      memberCode,
      action: 'congregation.member_created',
      targetType: 'congregationMember',
      targetId: memberId,
      summary: `Profil jemaat baru (${memberCode}) ditambahkan ke direktori rahasia gereja.`,
    },
    now,
  );

  try {
    await batch.commit();
    return memberId;
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.CREATE,
      `churches/${activeChurchId}/congregationMembers/${memberId}`,
    );
  }
}

export async function updateCongregationMember(
  activeChurchId: string,
  membership: ChurchMembership | null | undefined,
  member: CongregationMember,
  input: MemberFormInput,
  requiredFields: readonly CongregationRequiredField[],
  families: readonly FamilyGroup[],
  changedFieldLabels: string[] = [],
): Promise<void> {
  assertBrowserOnline('Pembaruan profil jemaat');
  assertCongregationOwner(activeChurchId, membership);
  if (member.churchId !== activeChurchId || !isValidFirestoreId(member.id)) {
    throw new Error('Isolasi gereja atau ID anggota tidak valid.');
  }

  const validation = validateMemberForm(input, requiredFields);
  if (!validation.valid) {
    throw new Error(validation.errors[0]);
  }

  const family = input.familyGroupId
    ? families.find((f) => f.id === input.familyGroupId)
    : undefined;
  const detailFields = changedFieldLabels.length > 0 ? ` (${changedFieldLabels.join(', ')})` : '';

  try {
    await runTransaction(db, async (trx) => {
      const memberRef = doc(db, 'churches', activeChurchId, 'congregationMembers', member.id);
      const snap = await trx.get(memberRef);
      if (!snap.exists()) {
        throw new Error('Profil jemaat tidak ditemukan.');
      }
      const liveMember = snap.data() as CongregationMember;
      if (detectVersionConflict(member.version, liveMember.version)) {
        throw new Error(
          'Konflik versi: data jemaat ini baru saja diperbarui dari sesi atau perangkat lain. Muat ulang profil sebelum menyimpan perubahan.',
        );
      }
      trx.update(memberRef, {
        ...buildMemberWriteFields(input, family?.name || ''),
        version: (liveMember.version ?? 1) + 1,
        updatedBy: membership.uid,
        updatedAt: serverTimestamp(),
      });
    });

    const now = serverTimestamp();
    const batch = writeBatch(db);
    appendActivityAndAudit(
      batch,
      activeChurchId,
      membership,
      {
        memberId: member.id,
        memberCode: member.memberCode,
        action: 'congregation.member_updated',
        targetType: 'congregationMember',
        targetId: member.id,
        summary: `Profil jemaat ${member.memberCode} diperbarui${detailFields}.`,
      },
      now,
    );
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `churches/${activeChurchId}/congregationMembers/${member.id}`,
    );
  }
}

export async function updateCongregationMemberStatus(
  activeChurchId: string,
  membership: ChurchMembership | null | undefined,
  member: CongregationMember,
  newStatus: CongregationMemberStatus,
  note?: string,
): Promise<void> {
  assertBrowserOnline('Perubahan status keanggotaan jemaat');
  assertCongregationOwner(activeChurchId, membership);
  if (member.churchId !== activeChurchId) {
    throw new Error('Isolasi gereja tidak cocok.');
  }

  try {
    await runTransaction(db, async (trx) => {
      const memberRef = doc(db, 'churches', activeChurchId, 'congregationMembers', member.id);
      const snap = await trx.get(memberRef);
      if (!snap.exists()) throw new Error('Profil jemaat tidak ditemukan.');
      const liveMember = snap.data() as CongregationMember;
      if (detectVersionConflict(member.version, liveMember.version)) {
        throw new Error(
          'Konflik versi: status jemaat baru saja diubah dari perangkat lain. Muat ulang data terbaru.',
        );
      }
      trx.update(memberRef, {
        status: newStatus,
        version: (liveMember.version ?? 1) + 1,
        updatedBy: membership.uid,
        updatedAt: serverTimestamp(),
      });
    });

    const now = serverTimestamp();
    const batch = writeBatch(db);
    appendActivityAndAudit(
      batch,
      activeChurchId,
      membership,
      {
        memberId: member.id,
        memberCode: member.memberCode,
        action: 'congregation.status_changed',
        targetType: 'congregationMember',
        targetId: member.id,
        summary: `Status keanggotaan ${member.memberCode} diubah dari "${member.status}" menjadi "${newStatus}"${note ? ` — ${note.trim()}` : ''}.`,
      },
      now,
    );
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `churches/${activeChurchId}/congregationMembers/${member.id}`,
    );
  }
}

export async function archiveOrRestoreMember(
  activeChurchId: string,
  membership: ChurchMembership | null | undefined,
  member: CongregationMember,
  archive: boolean,
): Promise<void> {
  assertBrowserOnline('Pengarsipan atau pemulihan data jemaat');
  assertCongregationOwner(activeChurchId, membership);
  if (member.churchId !== activeChurchId) {
    throw new Error('Isolasi gereja tidak cocok.');
  }

  const now = serverTimestamp();
  const batch = writeBatch(db);
  batch.update(doc(db, 'churches', activeChurchId, 'congregationMembers', member.id), {
    archived: archive,
    archivedAt: archive ? now : null,
    archivedBy: archive ? membership.uid : '',
    updatedBy: membership.uid,
    updatedAt: now,
  });

  appendActivityAndAudit(
    batch,
    activeChurchId,
    membership,
    {
      memberId: member.id,
      memberCode: member.memberCode,
      action: archive ? 'congregation.member_archived' : 'congregation.member_restored',
      targetType: 'congregationMember',
      targetId: member.id,
      summary: archive
        ? `Profil jemaat ${member.memberCode} dipindahkan ke arsip.`
        : `Profil jemaat ${member.memberCode} dipulihkan dari arsip.`,
    },
    now,
  );

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `churches/${activeChurchId}/congregationMembers/${member.id}`,
    );
  }
}

// ============================================================================
// FAMILY GROUPS MANAGEMENT
// ============================================================================

export async function createFamilyGroup(
  activeChurchId: string,
  membership: ChurchMembership | null | undefined,
  input: {name: string; notes?: string},
  existingFamilies: readonly FamilyGroup[],
): Promise<string> {
  assertBrowserOnline('Pembuatan kelompok keluarga');
  assertCongregationOwner(activeChurchId, membership);
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120) {
    throw new Error('Nama kelompok keluarga wajib 2–120 karakter.');
  }

  const groupId = generateSecureId('fam');
  const familyCode = generateSequentialCode(
    'KLG',
    existingFamilies.map((f) => f.familyCode),
  );
  const now = serverTimestamp();

  const batch = writeBatch(db);
  batch.set(doc(db, 'churches', activeChurchId, 'familyGroups', groupId), {
    id: groupId,
    churchId: activeChurchId,
    ownerUid: membership.ownerUid,
    familyCode,
    name,
    notes: (input.notes || '').trim().slice(0, 600),
    archived: false,
    createdBy: membership.uid,
    updatedBy: membership.uid,
    createdAt: now,
    updatedAt: now,
  });

  appendActivityAndAudit(
    batch,
    activeChurchId,
    membership,
    {
      action: 'congregation.family_created',
      targetType: 'familyGroup',
      targetId: groupId,
      summary: `Kelompok keluarga baru (${familyCode} — ${name}) dibuat.`,
    },
    now,
  );

  try {
    await batch.commit();
    return groupId;
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.CREATE,
      `churches/${activeChurchId}/familyGroups/${groupId}`,
    );
  }
}

export async function assignMemberToFamily(
  activeChurchId: string,
  membership: ChurchMembership | null | undefined,
  member: CongregationMember,
  family: FamilyGroup | null,
  familyRole: FamilyRole,
): Promise<void> {
  assertBrowserOnline('Penetapan kelompok keluarga jemaat');
  assertCongregationOwner(activeChurchId, membership);
  if (member.churchId !== activeChurchId) {
    throw new Error('Isolasi gereja tidak cocok.');
  }

  const now = serverTimestamp();
  const batch = writeBatch(db);
  batch.update(doc(db, 'churches', activeChurchId, 'congregationMembers', member.id), {
    familyGroupId: family ? family.id : '',
    familyGroupName: family ? family.name : '',
    familyRole: family ? familyRole || 'other' : '',
    updatedBy: membership.uid,
    updatedAt: now,
  });

  if (family && familyRole === 'head') {
    batch.update(doc(db, 'churches', activeChurchId, 'familyGroups', family.id), {
      headMemberId: member.id,
      updatedBy: membership.uid,
      updatedAt: now,
    });
  }

  appendActivityAndAudit(
    batch,
    activeChurchId,
    membership,
    {
      memberId: member.id,
      memberCode: member.memberCode,
      action: family ? 'congregation.family_assigned' : 'congregation.family_unlinked',
      targetType: 'congregationMember',
      targetId: member.id,
      summary: family
        ? `Anggota ${member.memberCode} dihubungkan ke keluarga ${family.familyCode} (${family.name}).`
        : `Anggota ${member.memberCode} dilepaskan dari kelompok keluarga tanpa menghapus profil jemaat.`,
    },
    now,
  );

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `churches/${activeChurchId}/congregationMembers/${member.id}`,
    );
  }
}

// ============================================================================
// BATCH IMPORT & AUDITABLE EXPORT
// ============================================================================

export async function batchImportCongregationMembers(
  activeChurchId: string,
  membership: ChurchMembership | null | undefined,
  rows: readonly ParsedImportRow[],
  existingMembers: readonly CongregationMember[],
): Promise<{importedCount: number; skippedCount: number}> {
  assertBrowserOnline('Impor massal data jemaat');
  assertCongregationOwner(activeChurchId, membership);

  const eligible = rows.filter((r) => !r.skip && r.errors.length === 0);
  const skippedCount = rows.length - eligible.length;
  if (eligible.length === 0) {
    throw new Error('Tidak ada baris valid yang siap diimpor.');
  }

  const codes = existingMembers.map((m) => m.memberCode);
  const chunkSize = 150; // Keeps each Firestore WriteBatch comfortably under 500 ops

  for (let i = 0; i < eligible.length; i += chunkSize) {
    const chunk = eligible.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    const now = serverTimestamp();

    for (const row of chunk) {
      const memberId = generateSecureId('mbr');
      const memberCode = generateSequentialCode('JMT', codes);
      codes.push(memberCode);

      batch.set(doc(db, 'churches', activeChurchId, 'congregationMembers', memberId), {
        id: memberId,
        churchId: activeChurchId,
        ownerUid: membership.ownerUid,
        memberCode,
        ...buildMemberWriteFields(
          {
            fullName: row.fullName,
            nickname: row.nickname,
            gender: row.gender,
            birthDate: row.birthDate,
            phone: row.phone,
            email: row.email,
            address: row.address,
            joinedDate: row.joinedDate,
            status: row.status,
            adminNotes: row.adminNotes,
          },
          '',
        ),
        attachments: [],
        archived: false,
        version: 1,
        createdBy: membership.uid,
        updatedBy: membership.uid,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (i === 0) {
      appendActivityAndAudit(
        batch,
        activeChurchId,
        membership,
        {
          action: 'congregation.import_completed',
          targetType: 'congregation',
          targetId: activeChurchId,
          summary: `Impor massal jemaat selesai: ${eligible.length} data disimpan, ${skippedCount} baris dilewati.`,
        },
        now,
      );
    }

    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.WRITE,
        `churches/${activeChurchId}/congregationMembers`,
      );
    }
  }

  return {importedCount: eligible.length, skippedCount};
}

export async function recordCongregationExportAudit(
  activeChurchId: string,
  membership: ChurchMembership | null | undefined,
  format: 'csv' | 'xlsx',
  recordCount: number,
  reportKind = 'direktori_jemaat',
): Promise<void> {
  assertCongregationOwner(activeChurchId, membership);
  const now = serverTimestamp();
  const batch = writeBatch(db);
  appendActivityAndAudit(
    batch,
    activeChurchId,
    membership,
    {
      action: 'congregation.data_exported',
      targetType: 'congregation',
      targetId: activeChurchId,
      summary: `Ekspor privat ${reportKind} (${format.toUpperCase()}, ${recordCount} baris) diunduh oleh Owner.`,
    },
    now,
  );
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `churches/${activeChurchId}/congregationActivities`,
    );
  }
}

// ============================================================================
// PRIVATE FIREBASE STORAGE (Owner-Only Photos & Confidential Documents)
// ============================================================================

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'dokumen';
}

export async function uploadMemberPhoto(
  activeChurchId: string,
  membership: ChurchMembership | null | undefined,
  member: CongregationMember,
  file: File,
): Promise<string> {
  assertBrowserOnline('Unggah foto jemaat');
  assertCongregationOwner(activeChurchId, membership);
  if (!ALLOWED_PHOTO_TYPES.has(file.type)) {
    throw new Error('Format foto harus JPG, PNG, atau WebP.');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('Ukuran foto maksimal 5 MB.');
  }

  const storagePath = `churches/${activeChurchId}/congregation/members/${member.id}/photo_${Date.now()}_${sanitizeFileName(file.name)}`;
  try {
    await uploadBytes(ref(storage, storagePath), file, {
      contentType: file.type,
      customMetadata: {
        churchId: activeChurchId,
        ownerUid: membership.ownerUid,
      },
    });

    const now = serverTimestamp();
    const batch = writeBatch(db);
    batch.update(doc(db, 'churches', activeChurchId, 'congregationMembers', member.id), {
      photoPath: storagePath,
      updatedBy: membership.uid,
      updatedAt: now,
    });
    appendActivityAndAudit(
      batch,
      activeChurchId,
      membership,
      {
        memberId: member.id,
        memberCode: member.memberCode,
        action: 'congregation.photo_uploaded',
        targetType: 'congregationMember',
        targetId: member.id,
        summary: `Foto profil privat untuk ${member.memberCode} diperbarui di penyimpanan terisolasi.`,
      },
      now,
    );
    await batch.commit();
    return storagePath;
  } catch (error) {
    throw new Error(
      `Gagal mengunggah foto ke Firebase Storage privat: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function uploadMemberAttachment(
  activeChurchId: string,
  membership: ChurchMembership | null | undefined,
  member: CongregationMember,
  file: File,
): Promise<CongregationAttachment> {
  assertBrowserOnline('Unggah dokumen jemaat');
  assertCongregationOwner(activeChurchId, membership);
  if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) {
    throw new Error('Format lampiran harus PDF, JPG, PNG, atau WebP.');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('Ukuran lampiran maksimal 5 MB.');
  }
  const currentList = member.attachments || [];
  if (currentList.length >= 10) {
    throw new Error('Maksimal 10 lampiran per profil jemaat.');
  }

  const attId = generateSecureId('att');
  const storagePath = `churches/${activeChurchId}/congregation/members/${member.id}/doc_${attId}_${sanitizeFileName(file.name)}`;

  try {
    await uploadBytes(ref(storage, storagePath), file, {
      contentType: file.type,
      customMetadata: {
        churchId: activeChurchId,
        ownerUid: membership.ownerUid,
      },
    });

    const attachment: CongregationAttachment = {
      id: attId,
      name: file.name.slice(0, 120),
      storagePath,
      contentType: file.type,
      sizeBytes: file.size,
      uploadedAt: new Date().toISOString(),
      uploadedBy: membership.uid,
    };

    const now = serverTimestamp();
    const batch = writeBatch(db);
    batch.update(doc(db, 'churches', activeChurchId, 'congregationMembers', member.id), {
      attachments: [...currentList, attachment],
      updatedBy: membership.uid,
      updatedAt: now,
    });
    appendActivityAndAudit(
      batch,
      activeChurchId,
      membership,
      {
        memberId: member.id,
        memberCode: member.memberCode,
        action: 'congregation.attachment_uploaded',
        targetType: 'congregationMember',
        targetId: member.id,
        summary: `Dokumen privat "${attachment.name}" ditambahkan ke profil ${member.memberCode}.`,
      },
      now,
    );
    await batch.commit();
    return attachment;
  } catch (error) {
    throw new Error(
      `Gagal mengunggah dokumen privat: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function removeMemberAttachment(
  activeChurchId: string,
  membership: ChurchMembership | null | undefined,
  member: CongregationMember,
  attachment: CongregationAttachment,
): Promise<void> {
  assertBrowserOnline('Penghapusan dokumen jemaat');
  assertCongregationOwner(activeChurchId, membership);
  try {
    await deleteObject(ref(storage, attachment.storagePath)).catch(() => {
      // Proceed to remove metadata reference even if object was already removed
    });

    const nextList = (member.attachments || []).filter((a) => a.id !== attachment.id);
    const now = serverTimestamp();
    const batch = writeBatch(db);
    batch.update(doc(db, 'churches', activeChurchId, 'congregationMembers', member.id), {
      attachments: nextList,
      updatedBy: membership.uid,
      updatedAt: now,
    });
    appendActivityAndAudit(
      batch,
      activeChurchId,
      membership,
      {
        memberId: member.id,
        memberCode: member.memberCode,
        action: 'congregation.attachment_removed',
        targetType: 'congregationMember',
        targetId: member.id,
        summary: `Dokumen privat "${attachment.name}" dihapus dari profil ${member.memberCode}.`,
      },
      now,
    );
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `churches/${activeChurchId}/congregationMembers/${member.id}`,
    );
  }
}

export async function downloadPrivateStorageBlob(
  activeChurchId: string,
  membership: ChurchMembership | null | undefined,
  storagePath: string,
  contentType = 'application/octet-stream',
): Promise<Blob> {
  assertCongregationOwner(activeChurchId, membership);
  if (!storagePath.startsWith(`churches/${activeChurchId}/congregation/`)) {
    throw new Error('Pelanggaran isolasi penyimpanan: jalur berkas tidak cocok dengan gereja aktif.');
  }
  const bytes = await getBytes(ref(storage, storagePath), MAX_FILE_BYTES + 1024);
  return new Blob([bytes], {type: contentType});
}
