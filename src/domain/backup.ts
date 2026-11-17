import type {
  BackupRecord,
  BackupRecordSummary,
  ChurchMembership,
} from '../types/domain';

export const BACKUP_ARCHIVE_FORMAT = 'higayon-church-backup-v1';
export const MAX_BACKUP_ARCHIVE_BYTES = 25 * 1024 * 1024; // 25 MB

export interface ChurchBackupArchive {
  format: typeof BACKUP_ARCHIVE_FORMAT;
  backupId: string;
  churchId: string;
  ownerUid: string;
  scope: BackupRecord['scope'];
  backupType: 'manual' | 'scheduled' | 'pre_restore';
  createdAtIso: string;
  createdBy: string;
  checksumAlgorithm: 'SHA-256';
  checksum: string;
  collections: {
    church: Record<string, unknown> | null;
    settings: Record<string, unknown>[];
    memberships: Record<string, unknown>[];
    auditLogs: Record<string, unknown>[];
    congregationMembers: Record<string, unknown>[];
    familyGroups: Record<string, unknown>[];
    congregationActivities: Record<string, unknown>[];
    financeAccounts: Record<string, unknown>[];
    financeCategories: Record<string, unknown>[];
    financeTransactions: Record<string, unknown>[];
    financeSettings: Record<string, unknown>[];
    financeAuditLogs: Record<string, unknown>[];
  };
  attachmentManifest: {
    congregationPaths: string[];
    financeReceiptPaths: string[];
  };
}

export function assertOnlineState(isOnline: boolean, actionLabel = 'tindakan sensitif ini'): void {
  if (!isOnline) {
    throw new Error(
      `Koneksi internet terputus (offline). ${actionLabel} diblokir demi keamanan sinkronisasi dan konsistensi data.`,
    );
  }
}

export function detectVersionConflict(
  expectedVersion: number | undefined,
  liveVersion: number | undefined,
): boolean {
  if (expectedVersion === undefined) return false;
  return (liveVersion ?? 1) !== expectedVersion;
}

export async function computeSha256Hex(payload: string): Promise<string> {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const encoded = new TextEncoder().encode(payload);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  const {createHash} = await import('node:crypto');
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

export function canonicalizeArchiveBody(
  archiveWithoutChecksum: Omit<ChurchBackupArchive, 'checksum'>,
): string {
  return JSON.stringify(archiveWithoutChecksum);
}

export function summarizeBackupArchive(archive: ChurchBackupArchive): BackupRecordSummary {
  return {
    members: archive.collections.congregationMembers.length,
    families: archive.collections.familyGroups.length,
    accounts: archive.collections.financeAccounts.length,
    categories: archive.collections.financeCategories.length,
    transactions: archive.collections.financeTransactions.length,
    auditLogs:
      archive.collections.auditLogs.length + archive.collections.financeAuditLogs.length,
  };
}

export async function buildSignedBackupArchive(
  input: Omit<ChurchBackupArchive, 'format' | 'checksumAlgorithm' | 'checksum'>,
): Promise<{archive: ChurchBackupArchive; serialized: string; sizeBytes: number}> {
  const body: Omit<ChurchBackupArchive, 'checksum'> = {
    format: BACKUP_ARCHIVE_FORMAT,
    backupId: input.backupId,
    churchId: input.churchId,
    ownerUid: input.ownerUid,
    scope: input.scope,
    backupType: input.backupType,
    createdAtIso: input.createdAtIso,
    createdBy: input.createdBy,
    checksumAlgorithm: 'SHA-256',
    collections: input.collections,
    attachmentManifest: input.attachmentManifest,
  };

  const checksum = await computeSha256Hex(canonicalizeArchiveBody(body));
  const archive: ChurchBackupArchive = {
    ...body,
    checksum,
  };
  const serialized = JSON.stringify(archive, null, 2);
  const sizeBytes = new TextEncoder().encode(serialized).byteLength;
  return {archive, serialized, sizeBytes};
}

export async function validateBackupArchiveObject(
  rawObj: unknown,
  expectedChurchId: string,
  expectedChecksum?: string,
): Promise<{
  valid: boolean;
  error?: string;
  archive?: ChurchBackupArchive;
  summary?: BackupRecordSummary;
}> {
  if (!rawObj || typeof rawObj !== 'object') {
    return {valid: false, error: 'Format arsip backup tidak valid (bukan objek JSON).'};
  }

  const candidate = rawObj as Partial<ChurchBackupArchive>;
  if (candidate.format !== BACKUP_ARCHIVE_FORMAT) {
    return {
      valid: false,
      error: `Format arsip tidak dikenali. Sistem hanya mendukung ${BACKUP_ARCHIVE_FORMAT}.`,
    };
  }
  if (!candidate.churchId || candidate.churchId !== expectedChurchId) {
    return {
      valid: false,
      error: `Isolasi gereja gagal: arsip backup milik gereja lain (${candidate.churchId || 'tidak diketahui'}), bukan gereja aktif (${expectedChurchId}).`,
    };
  }
  if (!candidate.checksum || candidate.checksumAlgorithm !== 'SHA-256') {
    return {valid: false, error: 'Arsip backup tidak memiliki checksum SHA-256 yang valid.'};
  }
  if (expectedChecksum && candidate.checksum !== expectedChecksum) {
    return {
      valid: false,
      error: 'Checksum arsip tidak cocok dengan catatan metadata backup.',
    };
  }
  if (!candidate.collections || typeof candidate.collections !== 'object') {
    return {valid: false, error: 'Struktur koleksi di dalam arsip backup rusak atau kosong.'};
  }

  const cols = candidate.collections;
  const requiredArrays: Array<keyof ChurchBackupArchive['collections']> = [
    'settings',
    'memberships',
    'auditLogs',
    'congregationMembers',
    'familyGroups',
    'congregationActivities',
    'financeAccounts',
    'financeCategories',
    'financeTransactions',
    'financeSettings',
    'financeAuditLogs',
  ];
  for (const key of requiredArrays) {
    if (!Array.isArray(cols[key])) {
      return {
        valid: false,
        error: `Koleksi "${key}" di dalam arsip backup tidak valid atau korup.`,
      };
    }
  }

  const normalizedBody: Omit<ChurchBackupArchive, 'checksum'> = {
    format: BACKUP_ARCHIVE_FORMAT,
    backupId: String(candidate.backupId || ''),
    churchId: candidate.churchId,
    ownerUid: String(candidate.ownerUid || ''),
    scope: candidate.scope || 'full',
    backupType: candidate.backupType || 'manual',
    createdAtIso: String(candidate.createdAtIso || ''),
    createdBy: String(candidate.createdBy || ''),
    checksumAlgorithm: 'SHA-256',
    collections: cols,
    attachmentManifest: candidate.attachmentManifest || {
      congregationPaths: [],
      financeReceiptPaths: [],
    },
  };

  const computedChecksum = await computeSha256Hex(canonicalizeArchiveBody(normalizedBody));
  if (computedChecksum !== candidate.checksum) {
    return {
      valid: false,
      error:
        'Verifikasi integritas SHA-256 gagal: isi file arsip telah dimodifikasi atau rusak.',
    };
  }

  const archive: ChurchBackupArchive = {
    ...normalizedBody,
    checksum: candidate.checksum,
  };
  return {
    valid: true,
    archive,
    summary: summarizeBackupArchive(archive),
  };
}

export function validateOwnershipTransferCandidate(
  actor: ChurchMembership | null | undefined,
  target: ChurchMembership | null | undefined,
): {valid: boolean; error?: string} {
  if (!actor || actor.status !== 'active' || actor.role !== 'owner') {
    return {
      valid: false,
      error: 'Hanya Church Owner aktif yang berhak memulai pemindahan kepemilikan gereja.',
    };
  }
  if (!target || target.churchId !== actor.churchId) {
    return {
      valid: false,
      error: 'Penerima transfer kepemilikan harus merupakan anggota terdaftar pada gereja yang sama.',
    };
  }
  if (target.status !== 'active') {
    return {
      valid: false,
      error: 'Akun penerima harus berstatus aktif sebelum menerima kepemilikan gereja.',
    };
  }
  if (target.uid === actor.uid) {
    return {
      valid: false,
      error: 'Anda tidak dapat memindahkan kepemilikan gereja ke akun Anda sendiri.',
    };
  }
  return {valid: true};
}
