import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_FINANCE_PERMISSIONS,
  assertTenantContext,
  canAccessModule,
  canManageMember,
  getDashboardScope,
  getNavigationForMembership,
  hasFinancePermission,
  requiresStrongAccountProtection,
  sanitizeRolePermissions,
} from './rbac';
import type {ChurchMembership} from '../types/domain';

function makeMembership(overrides: Partial<ChurchMembership>): ChurchMembership {
  return {
    uid: 'user-1',
    churchId: 'church-a',
    ownerUid: 'owner-1',
    displayName: 'Budi Santoso',
    email: 'budi@gereja.id',
    role: 'church_staff',
    status: 'active',
    financePermissions: [],
    staffPermissions: ['dashboard:basic'],
    invitedBy: 'owner-1',
    ...overrides,
  };
}

test('Only active Church Owner can access Congregation Management', () => {
  const owner = makeMembership({uid: 'owner-1', role: 'owner'});
  const finMgr = makeMembership({
    role: 'finance_manager',
    financePermissions: ['finance.view', 'finance.approve', 'finance.viewReports'],
  });
  const finStaff = makeMembership({
    role: 'finance_staff',
    financePermissions: ['finance.view', 'finance.create'],
  });
  const staff = makeMembership({role: 'church_staff'});

  assert.equal(canAccessModule(owner, 'congregation'), true);
  assert.equal(canAccessModule(finMgr, 'congregation'), false);
  assert.equal(canAccessModule(finStaff, 'congregation'), false);
  assert.equal(canAccessModule(staff, 'congregation'), false);
  assert.equal(canAccessModule(null, 'congregation', true), false);
});

test('Platform Admin never receives Congregation or Finance access to tenant workspaces', () => {
  assert.equal(canAccessModule(null, 'platform_admin', true), true);
  assert.equal(canAccessModule(null, 'congregation', true), false);
  assert.equal(canAccessModule(null, 'finance', true), false);
  assert.equal(canAccessModule(null, 'reports', true), false);

  const staffWithAdmin = makeMembership({role: 'church_staff'});
  assert.equal(canAccessModule(staffWithAdmin, 'congregation', true), false);
  assert.equal(canAccessModule(staffWithAdmin, 'finance', true), false);
});

test('All 13 granular finance permissions work accurately and support legacy aliases', () => {
  assert.equal(ALLOWED_FINANCE_PERMISSIONS.length, 13);

  const finNoPerms = makeMembership({role: 'finance_staff', financePermissions: []});
  const finReportsOnly = makeMembership({
    role: 'finance_staff',
    financePermissions: ['finance.viewReports'],
  });
  const finLegacy = makeMembership({
    role: 'finance_manager',
    financePermissions: ['finance:read', 'reports:finance'],
  });
  const staff = makeMembership({
    role: 'church_staff',
    financePermissions: ['finance.view'] as never,
  });

  assert.equal(canAccessModule(finNoPerms, 'finance'), false);
  assert.equal(canAccessModule(finReportsOnly, 'finance'), false);
  assert.equal(canAccessModule(finReportsOnly, 'reports'), true);
  assert.equal(canAccessModule(finLegacy, 'finance'), true);
  assert.equal(hasFinancePermission(finLegacy, 'finance.view'), true);
  assert.equal(hasFinancePermission(finLegacy, 'finance.viewReports'), true);
  assert.equal(hasFinancePermission(finLegacy, 'finance.approve'), false);
  assert.equal(canAccessModule(staff, 'finance'), false);
  assert.equal(hasFinancePermission(staff, 'finance.view'), false);
});

test('Revoked or suspended memberships immediately lose all church module access', () => {
  const suspendedOwner = makeMembership({uid: 'owner-1', role: 'owner', status: 'suspended'});
  const revokedFinance = makeMembership({
    role: 'finance_manager',
    status: 'revoked',
    financePermissions: ['finance.view', 'finance.approve'],
  });

  assert.equal(canAccessModule(suspendedOwner, 'congregation'), false);
  assert.equal(canAccessModule(suspendedOwner, 'dashboard'), false);
  assert.equal(canAccessModule(revokedFinance, 'finance'), false);
  assert.equal(hasFinancePermission(revokedFinance, 'finance.approve'), false);
});

test('sanitizeRolePermissions strips finance permissions from church_staff and normalizes granular permissions', () => {
  const cleanedStaff = sanitizeRolePermissions(
    'church_staff',
    ['finance.view', 'finance.approve', 'congregation:read'],
    ['dashboard:basic'],
  );
  assert.deepEqual(cleanedStaff.financePermissions, []);

  const cleanedFinance = sanitizeRolePermissions(
    'finance_manager',
    ['finance:read', 'finance.submit', 'congregation:read', 'admin:all'],
    [],
  );
  assert.deepEqual(cleanedFinance.financePermissions, ['finance.view', 'finance.submit']);
});

test('assertTenantContext rejects cross-church access attempts', () => {
  const membershipA = makeMembership({churchId: 'church-a', role: 'owner'});
  assert.throws(() => assertTenantContext('church-a', 'church-b', membershipA));
  assert.throws(() => assertTenantContext('church-b', 'church-b', membershipA));
  assert.doesNotThrow(() => assertTenantContext('church-a', 'church-a', membershipA));
});

test('Navigation filtering, strong protection check, and member management guard work accurately', () => {
  const owner = makeMembership({uid: 'owner-1', role: 'owner'});
  const finApprover = makeMembership({
    uid: 'fin-1',
    role: 'finance_manager',
    financePermissions: ['finance.view', 'finance.approve'],
  });
  const staff = makeMembership({uid: 'staff-1', role: 'church_staff'});

  assert.equal(getNavigationForMembership(owner).length, 9);
  assert.deepEqual(
    getNavigationForMembership(finApprover).map((i) => i.id),
    ['dashboard', 'finance', 'reports', 'account_settings'],
  );
  assert.deepEqual(
    getNavigationForMembership(staff).map((i) => i.id),
    ['dashboard', 'account_settings'],
  );

  assert.equal(requiresStrongAccountProtection(owner), true);
  assert.equal(requiresStrongAccountProtection(finApprover), true);
  assert.equal(requiresStrongAccountProtection(staff), false);

  assert.equal(canManageMember(owner, finApprover), true);
  assert.equal(canManageMember(owner, owner), false);
  assert.equal(canManageMember(finApprover, staff), false);

  assert.equal(getDashboardScope(owner), 'owner');
  assert.equal(getDashboardScope(finApprover), 'finance');
  assert.equal(getDashboardScope(staff), 'staff');
});
