import type {
  ChurchMembership,
  ChurchRole,
  FinancePermission,
  GranularFinancePermission,
  NavModuleId,
  StaffPermission,
} from '../types/domain';

export const ALLOWED_FINANCE_PERMISSIONS: readonly GranularFinancePermission[] = [
  'finance.view',
  'finance.create',
  'finance.editDraft',
  'finance.submit',
  'finance.approve',
  'finance.reject',
  'finance.void',
  'finance.export',
  'finance.viewReports',
  'finance.viewReceipts',
  'finance.manageAccounts',
  'finance.manageCategories',
  'finance.manageSettings',
] as const;

const LEGACY_TO_GRANULAR_MAP: Record<string, GranularFinancePermission> = {
  'finance:read': 'finance.view',
  'finance:create': 'finance.create',
  'finance:edit': 'finance.editDraft',
  'finance:approve': 'finance.approve',
  'finance:export': 'finance.export',
  'reports:finance': 'finance.viewReports',
};

export const ALLOWED_STAFF_PERMISSIONS: readonly StaffPermission[] = [
  'dashboard:basic',
  'church:view_profile',
] as const;

export interface NavItemDefinition {
  id: NavModuleId;
  label: string;
  section: 'core' | 'governance' | 'personal' | 'platform';
  description: string;
}

export const ALL_NAV_ITEMS: readonly NavItemDefinition[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    section: 'core',
    description: 'Ringkasan ruang kerja sesuai peran',
  },
  {
    id: 'congregation',
    label: 'Manajemen Jemaat',
    section: 'core',
    description: 'Data jemaat rahasia (Khusus Owner)',
  },
  {
    id: 'finance',
    label: 'Manajemen Keuangan',
    section: 'core',
    description: 'Private Financial Room — akun, transaksi, & persetujuan',
  },
  {
    id: 'reports',
    label: 'Laporan Keuangan',
    section: 'core',
    description: 'Laporan arus kas & ekspor terotorisasi',
  },
  {
    id: 'users',
    label: 'Manajemen Pengguna',
    section: 'governance',
    description: 'Undangan, peran, dan pencabutan akses',
  },
  {
    id: 'backup',
    label: 'Backup & Pemulihan',
    section: 'governance',
    description: 'Cadangan dan integritas data gereja',
  },
  {
    id: 'audit',
    label: 'Audit Log',
    section: 'governance',
    description: 'Jejak aktivitas keamanan yang tidak dapat diubah',
  },
  {
    id: 'church_settings',
    label: 'Pengaturan Gereja',
    section: 'governance',
    description: 'Profil gereja, tahun fiskal, dan kebijakan keamanan',
  },
  {
    id: 'account_settings',
    label: 'Pengaturan Akun',
    section: 'personal',
    description: 'Profil pribadi, verifikasi, MFA, dan PIN aplikasi',
  },
  {
    id: 'platform_admin',
    label: 'Konsol Platform',
    section: 'platform',
    description: 'Kesehatan sistem & konfigurasi teknis platform',
  },
] as const;

export function normalizeFinancePermission(perm: string): GranularFinancePermission | null {
  if ((ALLOWED_FINANCE_PERMISSIONS as readonly string[]).includes(perm)) {
    return perm as GranularFinancePermission;
  }
  return LEGACY_TO_GRANULAR_MAP[perm] || null;
}

export function getNormalizedFinancePermissions(
  membership: ChurchMembership | null | undefined,
): GranularFinancePermission[] {
  if (!membership || membership.status !== 'active') return [];
  if (membership.role === 'owner') return [...ALLOWED_FINANCE_PERMISSIONS];
  if (membership.role !== 'finance_manager' && membership.role !== 'finance_staff') {
    return [];
  }
  const set = new Set<GranularFinancePermission>();
  for (const p of membership.financePermissions) {
    const normalized = normalizeFinancePermission(p);
    if (normalized) set.add(normalized);
  }
  return Array.from(set);
}

/**
 * Evaluates module access strictly using active church membership, role, and granular permissions.
 * Security invariants:
 * - Default deny: returns false when membership is missing or not active.
 * - Congregation data is accessible ONLY by an active 'owner'.
 * - Finance Manager / Finance Staff never gain Congregation access.
 * - Church Staff never gain Congregation or Finance access.
 * - Platform Admin never gains tenant Congregation or Finance access via platform role.
 */
export function canAccessModule(
  membership: ChurchMembership | null | undefined,
  moduleId: NavModuleId,
  isPlatformAdmin = false,
): boolean {
  if (moduleId === 'account_settings') {
    return true;
  }

  if (moduleId === 'platform_admin') {
    return isPlatformAdmin;
  }

  if (!membership || membership.status !== 'active') {
    return false;
  }

  const {role, staffPermissions} = membership;

  switch (moduleId) {
    case 'dashboard':
      return (
        role === 'owner' ||
        role === 'finance_manager' ||
        role === 'finance_staff' ||
        (role === 'church_staff' && staffPermissions.includes('dashboard:basic'))
      );

    case 'congregation':
      // STRICT INVARIANT: Only active Church Owner may ever access congregation data
      return role === 'owner';

    case 'finance': {
      if (role === 'owner') return true;
      if (role === 'finance_manager' || role === 'finance_staff') {
        const perms = getNormalizedFinancePermissions(membership);
        return perms.some((p) => p !== 'finance.viewReports' && p !== 'finance.export');
      }
      return false;
    }

    case 'reports':
      if (role === 'owner') return true;
      if (role === 'finance_manager' || role === 'finance_staff') {
        return (
          hasFinancePermission(membership, 'finance.viewReports') ||
          hasFinancePermission(membership, 'finance.view')
        );
      }
      return false;

    case 'users':
    case 'backup':
    case 'audit':
    case 'church_settings':
      return role === 'owner';

    default:
      return false;
  }
}

export function getNavigationForMembership(
  membership: ChurchMembership | null | undefined,
  isPlatformAdmin = false,
): NavItemDefinition[] {
  return ALL_NAV_ITEMS.filter((item) => canAccessModule(membership, item.id, isPlatformAdmin));
}

export function hasFinancePermission(
  membership: ChurchMembership | null | undefined,
  permission: FinancePermission,
): boolean {
  if (!membership || membership.status !== 'active') return false;
  if (membership.role === 'owner') return true;
  if (membership.role === 'finance_manager' || membership.role === 'finance_staff') {
    const target = normalizeFinancePermission(permission);
    if (!target) return false;
    return getNormalizedFinancePermissions(membership).includes(target);
  }
  return false;
}

export function hasAnyFinancePermission(
  membership: ChurchMembership | null | undefined,
): boolean {
  return getNormalizedFinancePermissions(membership).length > 0;
}

export function requiresStrongAccountProtection(
  membership: ChurchMembership | null | undefined,
): boolean {
  if (!membership || membership.status !== 'active') return false;
  if (membership.role === 'owner') return true;
  return (
    hasFinancePermission(membership, 'finance.approve') ||
    hasFinancePermission(membership, 'finance.void')
  );
}

/**
 * Sanitizes and enforces role/permission invariants before writing to Firestore.
 * Prevents privilege escalation and ensures church_staff has zero finance permissions.
 */
export function sanitizeRolePermissions(
  role: ChurchRole,
  financePermissions: readonly string[] = [],
  staffPermissions: readonly string[] = [],
): {
  financePermissions: GranularFinancePermission[];
  staffPermissions: StaffPermission[];
} {
  const validStaff = Array.from(
    new Set(
      staffPermissions.filter((p): p is StaffPermission =>
        (ALLOWED_STAFF_PERMISSIONS as readonly string[]).includes(p),
      ),
    ),
  );

  if (role === 'church_staff') {
    return {
      financePermissions: [],
      staffPermissions: validStaff.length > 0 ? validStaff : ['dashboard:basic'],
    };
  }

  if (role === 'owner') {
    return {
      financePermissions: [],
      staffPermissions: [],
    };
  }

  const validFinanceSet = new Set<GranularFinancePermission>();
  for (const raw of financePermissions) {
    const normalized = normalizeFinancePermission(raw);
    if (normalized) validFinanceSet.add(normalized);
  }

  return {
    financePermissions: Array.from(validFinanceSet),
    staffPermissions: validStaff.length > 0 ? validStaff : ['dashboard:basic'],
  };
}

/**
 * Enforces tenant isolation in application service calls before returning or mutating data.
 */
export function assertTenantContext(
  activeChurchId: string | null | undefined,
  targetChurchId: string,
  membership: ChurchMembership | null | undefined,
): asserts membership is ChurchMembership {
  if (!activeChurchId || !targetChurchId || activeChurchId !== targetChurchId) {
    throw new Error('Pelanggaran isolasi tenant: konteks gereja tidak cocok.');
  }
  if (!membership || membership.churchId !== targetChurchId || membership.status !== 'active') {
    throw new Error('Akses ditolak: keanggotaan gereja tidak aktif atau tidak ditemukan.');
  }
}

export function canManageMember(
  actor: ChurchMembership | null | undefined,
  target: ChurchMembership,
): boolean {
  if (!actor || actor.status !== 'active' || actor.role !== 'owner') return false;
  if (actor.churchId !== target.churchId) return false;
  if (actor.uid === target.uid || target.role === 'owner') return false;
  return true;
}

export function getDashboardScope(
  membership: ChurchMembership | null | undefined,
): 'owner' | 'finance' | 'staff' | 'none' {
  if (!membership || membership.status !== 'active') return 'none';
  if (membership.role === 'owner') return 'owner';
  if (membership.role === 'finance_manager' || membership.role === 'finance_staff') {
    return 'finance';
  }
  return 'staff';
}
