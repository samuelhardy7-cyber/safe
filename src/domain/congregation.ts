import type {
  ChurchMembership,
  CongregationMember,
  CongregationMemberStatus,
  CongregationRequiredField,
  FamilyGroup,
  FamilyRole,
} from '../types/domain';
import {EMAIL_REGEX} from './validation';

export const DEFAULT_REQUIRED_FIELDS: CongregationRequiredField[] = ['fullName', 'status'];

export const CONFIGURABLE_MEMBER_FIELDS: readonly CongregationRequiredField[] = [
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
] as const;

export const ALLOWED_MEMBER_STATUSES: readonly CongregationMemberStatus[] = [
  'active',
  'inactive',
  'visiting',
  'moved',
  'deceased',
] as const;

/**
 * STRICT OWNER-ONLY ASSERTION FOR CONGREGATION MODULE
 * Throws immediately for Finance Manager, Finance Staff, Church Staff, suspended/revoked users, or cross-church access.
 */
export function assertCongregationOwner(
  activeChurchId: string | null | undefined,
  membership: ChurchMembership | null | undefined,
): asserts membership is ChurchMembership {
  if (!activeChurchId || !membership) {
    throw new Error('Akses data jemaat ditolak: konteks gereja atau sesi tidak valid.');
  }
  if (membership.churchId !== activeChurchId) {
    throw new Error('Pelanggaran isolasi tenant: Church ID tidak cocok.');
  }
  if (membership.status !== 'active') {
    throw new Error('Akses ditolak: keanggotaan gereja tidak aktif.');
  }
  if (membership.role !== 'owner') {
    throw new Error(
      'Akses ditolak: seluruh data jemaat bersifat rahasia dan hanya dapat diakses oleh Church Owner.',
    );
  }
}

export function generateSequentialCode(
  prefix: 'JMT' | 'KLG',
  existingCodes: readonly string[],
  year = new Date().getFullYear(),
): string {
  const pattern = new RegExp(`^${prefix}-${year}-(\\d{4,})$`);
  let maxNum = 0;
  for (const code of existingCodes) {
    const match = pattern.exec(code.trim());
    if (match) {
      const n = Number.parseInt(match[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  return `${prefix}-${year}-${String(maxNum + 1).padStart(4, '0')}`;
}

export interface MemberFormInput {
  fullName: string;
  nickname?: string;
  gender?: '' | 'L' | 'P';
  birthDate?: string;
  phone?: string;
  email?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  joinedDate?: string;
  status: CongregationMemberStatus;
  familyGroupId?: string;
  familyRole?: FamilyRole;
  donorRefCode?: string;
  adminNotes?: string;
}

export function validateMemberForm(
  input: MemberFormInput,
  requiredFields: readonly CongregationRequiredField[] = DEFAULT_REQUIRED_FIELDS,
): {valid: boolean; errors: string[]} {
  const errors: string[] = [];
  const reqSet = new Set<CongregationRequiredField>([...DEFAULT_REQUIRED_FIELDS, ...requiredFields]);

  const fullName = (input.fullName || '').trim();
  if (fullName.length < 2 || fullName.length > 160) {
    errors.push('Nama lengkap wajib diisi (2–160 karakter).');
  }

  if (!ALLOWED_MEMBER_STATUSES.includes(input.status)) {
    errors.push('Status keanggotaan tidak valid.');
  }

  if (reqSet.has('nickname') && !(input.nickname || '').trim()) {
    errors.push('Nama panggilan wajib diisi sesuai kebijakan gereja.');
  }
  if ((input.nickname || '').trim().length > 80) {
    errors.push('Nama panggilan maksimal 80 karakter.');
  }

  if (reqSet.has('gender') && !input.gender) {
    errors.push('Jenis kelamin wajib dipilih sesuai kebijakan gereja.');
  }
  if (input.gender && !['', 'L', 'P'].includes(input.gender)) {
    errors.push('Pilihan jenis kelamin tidak valid.');
  }

  if (reqSet.has('birthDate') && !(input.birthDate || '').trim()) {
    errors.push('Tanggal lahir wajib diisi sesuai kebijakan gereja.');
  }
  if (input.birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.birthDate)) {
    errors.push('Format tanggal lahir harus YYYY-MM-DD.');
  }

  if (reqSet.has('phone') && !(input.phone || '').trim()) {
    errors.push('Nomor telepon wajib diisi sesuai kebijakan gereja.');
  }
  if ((input.phone || '').trim().length > 32) {
    errors.push('Nomor telepon maksimal 32 karakter.');
  }

  const email = (input.email || '').trim();
  if (reqSet.has('email') && !email) {
    errors.push('Alamat email wajib diisi sesuai kebijakan gereja.');
  }
  if (email && (!EMAIL_REGEX.test(email) || email.length > 200)) {
    errors.push('Format email tidak valid.');
  }

  if (reqSet.has('address') && !(input.address || '').trim()) {
    errors.push('Alamat tempat tinggal wajib diisi sesuai kebijakan gereja.');
  }
  if ((input.address || '').trim().length > 400) {
    errors.push('Alamat maksimal 400 karakter.');
  }

  if (reqSet.has('joinedDate') && !(input.joinedDate || '').trim()) {
    errors.push('Tanggal mulai anggota wajib diisi sesuai kebijakan gereja.');
  }
  if (input.joinedDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.joinedDate)) {
    errors.push('Format tanggal mulai anggota harus YYYY-MM-DD.');
  }

  if (reqSet.has('familyGroupId') && !(input.familyGroupId || '').trim()) {
    errors.push('Kelompok keluarga wajib dipilih sesuai kebijakan gereja.');
  }

  if ((input.adminNotes || '').length > 1200) {
    errors.push('Catatan administratif maksimal 1200 karakter.');
  }
  if ((input.donorRefCode || '').trim().length > 40) {
    errors.push('Kode referensi donatur anonim maksimal 40 karakter.');
  }

  return {valid: errors.length === 0, errors};
}

export type MemberSortOrder = 'name_asc' | 'name_desc' | 'joined_desc' | 'updated_desc';

export interface MemberFilterOptions {
  search?: string;
  status?: CongregationMemberStatus | 'all';
  familyGroupId?: string | 'all';
  archived?: boolean;
  sortBy?: MemberSortOrder;
}

export function filterAndSortMembers(
  members: readonly CongregationMember[],
  options: MemberFilterOptions,
): CongregationMember[] {
  const q = (options.search || '').trim().toLowerCase();
  const wantArchived = Boolean(options.archived);

  const filtered = members.filter((m) => {
    if (Boolean(m.archived) !== wantArchived) return false;
    if (options.status && options.status !== 'all' && m.status !== options.status) return false;
    if (options.familyGroupId && options.familyGroupId !== 'all') {
      if (options.familyGroupId === '__none__') {
        if (m.familyGroupId) return false;
      } else if (m.familyGroupId !== options.familyGroupId) {
        return false;
      }
    }
    if (q) {
      const hay = [
        m.fullName,
        m.nickname || '',
        m.memberCode,
        m.phone || '',
        m.email || '',
        m.familyGroupName || '',
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const sortBy = options.sortBy || 'name_asc';
  return [...filtered].sort((a, b) => {
    if (sortBy === 'name_asc') return a.fullName.localeCompare(b.fullName, 'id');
    if (sortBy === 'name_desc') return b.fullName.localeCompare(a.fullName, 'id');
    if (sortBy === 'joined_desc') {
      return (b.joinedDate || '').localeCompare(a.joinedDate || '');
    }
    const aSec = (a.updatedAt as {seconds?: number})?.seconds || 0;
    const bSec = (b.updatedAt as {seconds?: number})?.seconds || 0;
    return bSec - aSec;
  });
}

export interface CongregationStats {
  totalNonArchived: number;
  active: number;
  inactive: number;
  visiting: number;
  moved: number;
  deceased: number;
  archived: number;
  familyCount: number;
  monthlyGrowth: {month: string; count: number}[];
  familyDistribution: {name: string; count: number}[];
}

export function computeCongregationStats(
  members: readonly CongregationMember[],
  families: readonly FamilyGroup[],
): CongregationStats {
  let active = 0;
  let inactive = 0;
  let visiting = 0;
  let moved = 0;
  let deceased = 0;
  let archived = 0;

  const monthMap = new Map<string, number>();
  const familyCountMap = new Map<string, number>();

  for (const m of members) {
    if (m.archived) {
      archived++;
      continue;
    }
    if (m.status === 'active') active++;
    else if (m.status === 'inactive') inactive++;
    else if (m.status === 'visiting') visiting++;
    else if (m.status === 'moved') moved++;
    else if (m.status === 'deceased') deceased++;

    if (m.joinedDate && /^\d{4}-\d{2}/.test(m.joinedDate)) {
      const ym = m.joinedDate.slice(0, 7);
      monthMap.set(ym, (monthMap.get(ym) || 0) + 1);
    }

    const famLabel = m.familyGroupName?.trim() || 'Belum Terhubung Keluarga';
    familyCountMap.set(famLabel, (familyCountMap.get(famLabel) || 0) + 1);
  }

  const monthlyGrowth = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([month, count]) => ({month, count}));

  const familyDistribution = Array.from(familyCountMap.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(([name, count]) => ({name, count}));

  return {
    totalNonArchived: members.length - archived,
    active,
    inactive,
    visiting,
    moved,
    deceased,
    archived,
    familyCount: families.filter((f) => !f.archived).length,
    monthlyGrowth,
    familyDistribution,
  };
}

// ============================================================================
// CSV Parser & Exporter + Import Duplicate Detection
// ============================================================================

export function parseCsvText(rawText: string): string[][] {
  const clean = rawText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const firstLine = clean.split('\n')[0] || '';
  const delimiter =
    (firstLine.match(/;/g)?.length || 0) > (firstLine.match(/,/g)?.length || 0) ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n') {
      row.push(cell.trim());
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  row.push(cell.trim());
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

function escapeCsvCell(val: string): string {
  if (/[",\n;]/.test(val)) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export function buildCsvExport(members: readonly CongregationMember[]): string {
  const headers = [
    'Kode Anggota',
    'Nama Lengkap',
    'Nama Panggilan',
    'Jenis Kelamin',
    'Tanggal Lahir',
    'Telepon',
    'Email',
    'Alamat',
    'Tanggal Anggota',
    'Status',
    'Kelompok Keluarga',
    'Peran Keluarga',
    'Kode Referensi Donatur',
    'Catatan Administratif',
  ];

  const lines = [headers.map(escapeCsvCell).join(',')];
  for (const m of members) {
    lines.push(
      [
        m.memberCode,
        m.fullName,
        m.nickname || '',
        m.gender || '',
        m.birthDate || '',
        m.phone || '',
        m.email || '',
        m.address || '',
        m.joinedDate || '',
        m.status,
        m.familyGroupName || '',
        m.familyRole || '',
        m.donorRefCode || '',
        m.adminNotes || '',
      ]
        .map((v) => escapeCsvCell(String(v)))
        .join(','),
    );
  }
  return '\uFEFF' + lines.join('\n');
}

export interface ParsedImportRow {
  rowNumber: number;
  fullName: string;
  nickname: string;
  gender: '' | 'L' | 'P';
  birthDate: string;
  phone: string;
  email: string;
  address: string;
  joinedDate: string;
  status: CongregationMemberStatus;
  adminNotes: string;
  errors: string[];
  duplicateReason: string | null;
  skip: boolean;
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeStatusInput(raw: string): CongregationMemberStatus | null {
  const v = raw.trim().toLowerCase();
  if (!v || v === 'aktif' || v === 'active') return 'active';
  if (v === 'nonaktif' || v === 'inactive') return 'inactive';
  if (v === 'tamu' || v === 'simpatisan' || v === 'visiting') return 'visiting';
  if (v === 'pindah' || v === 'moved') return 'moved';
  if (v === 'meninggal' || v === 'deceased') return 'deceased';
  return null;
}

function normalizeGenderInput(raw: string): '' | 'L' | 'P' | null {
  const v = raw.trim().toLowerCase();
  if (!v) return '';
  if (v === 'l' || v === 'laki-laki' || v === 'pria' || v === 'm' || v === 'male') return 'L';
  if (v === 'p' || v === 'perempuan' || v === 'wanita' || v === 'f' || v === 'female') return 'P';
  return null;
}

export function mapMatrixToImportRows(
  matrix: string[][],
  existingMembers: readonly CongregationMember[],
  requiredFields: readonly CongregationRequiredField[] = DEFAULT_REQUIRED_FIELDS,
): ParsedImportRow[] {
  if (matrix.length < 2) return [];
  const headerKeys = matrix[0].map(normalizeHeader);

  const findCol = (aliases: string[]): number =>
    headerKeys.findIndex((k) => aliases.some((a) => k.includes(a)));

  const idxName = findCol(['namalengkap', 'fullname', 'nama']);
  const idxNick = findCol(['namapanggilan', 'nickname', 'panggilan']);
  const idxGender = findCol(['jeniskelamin', 'gender', 'kelamin']);
  const idxBirth = findCol(['tanggallahir', 'birthdate', 'tgllahir']);
  const idxPhone = findCol(['telepon', 'phone', 'nohp', 'hp', 'whatsapp']);
  const idxEmail = findCol(['email', 'surel']);
  const idxAddress = findCol(['alamat', 'address']);
  const idxJoined = findCol(['tanggalanggota', 'joineddate', 'tglgabung', 'mulai']);
  const idxStatus = findCol(['status']);
  const idxNotes = findCol(['catatan', 'notes']);

  const parsed: ParsedImportRow[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const r = matrix[i];
    if (r.every((c) => !c)) continue;

    const rawGender = idxGender >= 0 ? r[idxGender] || '' : '';
    const normGender = normalizeGenderInput(rawGender);
    const rawStatus = idxStatus >= 0 ? r[idxStatus] || '' : '';
    const normStatus = normalizeStatusInput(rawStatus);

    const item: ParsedImportRow = {
      rowNumber: i + 1,
      fullName: idxName >= 0 ? (r[idxName] || '').trim() : '',
      nickname: idxNick >= 0 ? (r[idxNick] || '').trim() : '',
      gender: normGender ?? '',
      birthDate: idxBirth >= 0 ? (r[idxBirth] || '').trim() : '',
      phone: idxPhone >= 0 ? (r[idxPhone] || '').trim() : '',
      email: idxEmail >= 0 ? (r[idxEmail] || '').trim().toLowerCase() : '',
      address: idxAddress >= 0 ? (r[idxAddress] || '').trim() : '',
      joinedDate: idxJoined >= 0 ? (r[idxJoined] || '').trim() : '',
      status: normStatus ?? 'active',
      adminNotes: idxNotes >= 0 ? (r[idxNotes] || '').trim() : '',
      errors: [],
      duplicateReason: null,
      skip: false,
    };

    if (normGender === null) {
      item.errors.push(`Jenis kelamin "${rawGender}" tidak dikenali (gunakan L atau P).`);
    }
    if (normStatus === null) {
      item.errors.push(`Status "${rawStatus}" tidak dikenali.`);
    }

    parsed.push(item);
  }

  return revalidateImportRows(parsed, existingMembers, requiredFields);
}

export function revalidateImportRows(
  rows: readonly ParsedImportRow[],
  existingMembers: readonly CongregationMember[],
  requiredFields: readonly CongregationRequiredField[] = DEFAULT_REQUIRED_FIELDS,
): ParsedImportRow[] {
  const existingKeys = new Set<string>();
  const existingEmails = new Set<string>();
  const existingPhones = new Set<string>();

  for (const m of existingMembers) {
    existingKeys.add(m.fullName.trim().toLowerCase());
    if (m.email) existingEmails.add(m.email.trim().toLowerCase());
    if (m.phone) existingPhones.add(m.phone.replace(/\s+/g, ''));
  }

  const seenNames = new Set<string>();
  const seenEmails = new Set<string>();

  return rows.map((row) => {
    const check = validateMemberForm(
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
      requiredFields,
    );

    let duplicateReason: string | null = null;
    const normName = row.fullName.trim().toLowerCase();
    const normEmail = row.email.trim().toLowerCase();
    const normPhone = row.phone.replace(/\s+/g, '');

    if (normName && existingKeys.has(normName)) {
      duplicateReason = 'Nama sudah terdaftar di direktori gereja.';
    } else if (normEmail && existingEmails.has(normEmail)) {
      duplicateReason = 'Alamat email sudah terdaftar di direktori gereja.';
    } else if (normPhone && existingPhones.has(normPhone)) {
      duplicateReason = 'Nomor telepon sudah terdaftar di direktori gereja.';
    } else if (normName && seenNames.has(normName)) {
      duplicateReason = 'Duplikat nama di dalam file impor.';
    } else if (normEmail && seenEmails.has(normEmail)) {
      duplicateReason = 'Duplikat email di dalam file impor.';
    }

    if (normName) seenNames.add(normName);
    if (normEmail) seenEmails.add(normEmail);

    return {
      ...row,
      errors: check.errors,
      duplicateReason,
    };
  });
}
