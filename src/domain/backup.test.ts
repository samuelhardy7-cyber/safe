import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertOnlineState,
  buildSignedBackupArchive,
  detectVersionConflict,
  validateBackupArchiveObject,
  validateOwnershipTransferCandidate,
} from './backup';
import type {ChurchMembership} from '../types/domain';

function makeMember(overrides: Partial<ChurchMembership>): ChurchMembership {
  return {
    uid: 'uid-1',
    churchId: 'church-a',
    ownerUid: 'owner-1',
    displayName: 'Pengguna',
    email: 'user@gereja.id',
    role: 'church_staff',
    status: 'active',
    financePermissions: [],
    staffPermissions: ['dashboard:basic'],
    invitedBy: 'owner-1',
    ...overrides,
  };
}

test('buildSignedBackupArchive & validateBackupArchiveObject verify SHA-256 and reject tampering or cross-church archive', async () => {
  const {archive} = await buildSignedBackupArchive({
    backupId: 'bkp-001',
    churchId: 'church-a',
    ownerUid: 'owner-1',
    scope: 'full',
    backupType: 'manual',
    createdAtIso: '2026-11-16T02:00:00.000Z',
    createdBy: 'owner-1',
    collections: {
      church: {id: 'church-a', name: 'Gereja A'},
      settings: [{churchId: 'church-a', sessionTimeoutMinutes: 30}],
      memberships: [],
      auditLogs: [],
      congregationMembers: [{id: 'mbr-1', fullName: 'Jemaat Rahasia'}],
      familyGroups: [],
      congregationActivities: [],
      financeAccounts: [{id: 'acc-1', currentBalance: 5000000}],
      financeCategories: [],
      financeTransactions: [],
      financeSettings: [],
      financeAuditLogs: [],
    },
    attachmentManifest: {
      congregationPaths: [],
      financeReceiptPaths: [],
    },
  });

  const ok = await validateBackupArchiveObject(archive, 'church-a', archive.checksum);
  assert.equal(ok.valid, true);
  assert.equal(ok.summary?.members, 1);
  assert.equal(ok.summary?.accounts, 1);

  const crossChurch = await validateBackupArchiveObject(archive, 'church-b');
  assert.equal(crossChurch.valid, false);
  assert.ok(crossChurch.error?.includes('Isolasi gereja gagal'));

  const tampered = structuredClone(archive);
  tampered.collections.financeAccounts[0].currentBalance = 999999999;
  const tamperedRes = await validateBackupArchiveObject(tampered, 'church-a');
  assert.equal(tamperedRes.valid, false);
  assert.ok(tamperedRes.error?.includes('SHA-256 gagal'));
});

test('detectVersionConflict flags stale optimistic concurrency versions', () => {
  assert.equal(detectVersionConflict(undefined, 1), false);
  assert.equal(detectVersionConflict(1, undefined), false);
  assert.equal(detectVersionConflict(2, 2), false);
  assert.equal(detectVersionConflict(2, 3), true);
  assert.equal(detectVersionConflict(1, 2), true);
});

test('assertOnlineState blocks sensitive operations while offline', () => {
  assert.doesNotThrow(() => assertOnlineState(true, 'Persetujuan transaksi'));
  assert.throws(() => assertOnlineState(false, 'Persetujuan transaksi'), /offline/i);
});

test('validateOwnershipTransferCandidate blocks non-owner initiation, self-transfer, inactive targets, and cross-church targets', () => {
  const owner = makeMember({uid: 'owner-1', role: 'owner'});
  const financeManager = makeMember({uid: 'fm-1', role: 'finance_manager'});
  const staffOtherChurch = makeMember({uid: 'st-2', churchId: 'church-b', role: 'church_staff'});
  const suspendedMember = makeMember({uid: 'st-3', status: 'suspended'});
  const validRecipient = makeMember({uid: 'fm-2', role: 'finance_manager'});

  // Finance manager cannot initiate ownership transfer (must be blocked)
  assert.equal(validateOwnershipTransferCandidate(financeManager, owner).valid, false);
  // Owner cannot transfer to self
  assert.equal(validateOwnershipTransferCandidate(owner, owner).valid, false);
  // Cross-church target blocked
  assert.equal(validateOwnershipTransferCandidate(owner, staffOtherChurch).valid, false);
  // Suspended target blocked
  assert.equal(validateOwnershipTransferCandidate(owner, suspendedMember).valid, false);
  // Valid transfer from active Owner to active same-church member
  assert.equal(validateOwnershipTransferCandidate(owner, validRecipient).valid, true);
});
