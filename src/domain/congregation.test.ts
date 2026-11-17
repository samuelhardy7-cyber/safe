import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertCongregationOwner,
  buildCsvExport,
  computeCongregationStats,
  filterAndSortMembers,
  generateSequentialCode,
  mapMatrixToImportRows,
  parseCsvText,
  validateMemberForm,
} from './congregation';
import type {ChurchMembership, CongregationMember, FamilyGroup} from '../types/domain';

function makeMembership(overrides: Partial<ChurchMembership>): ChurchMembership {
  return {
    uid: 'uid-1',
    churchId: 'church-a',
    ownerUid: 'owner-a',
    displayName: 'Pengguna',
    email: 'user@gereja.id',
    role: 'owner',
    status: 'active',
    financePermissions: [],
    staffPermissions: [],
    invitedBy: 'owner-a',
    ...overrides,
  };
}

function makeMember(overrides: Partial<CongregationMember>): CongregationMember {
  return {
    id: 'mem-1',
    churchId: 'church-a',
    ownerUid: 'owner-a',
    memberCode: 'JMT-2026-0001',
    fullName: 'Andreas Wijaya',
    status: 'active',
    archived: false,
    createdBy: 'owner-a',
    updatedBy: 'owner-a',
    ...overrides,
  };
}

test('assertCongregationOwner strictly blocks Finance Manager, Finance Staff, Church Staff, revoked, and cross-church users', () => {
  const ownerA = makeMembership({uid: 'owner-a', role: 'owner', churchId: 'church-a'});
  const finMgr = makeMembership({
    role: 'finance_manager',
    financePermissions: ['finance:read', 'finance:approve'],
  });
  const finStaff = makeMembership({role: 'finance_staff', financePermissions: ['finance:read']});
  const staff = makeMembership({role: 'church_staff'});
  const revokedOwner = makeMembership({role: 'owner', status: 'revoked'});
  const ownerB = makeMembership({uid: 'owner-b', role: 'owner', churchId: 'church-b'});

  assert.doesNotThrow(() => assertCongregationOwner('church-a', ownerA));
  assert.throws(() => assertCongregationOwner('church-a', finMgr));
  assert.throws(() => assertCongregationOwner('church-a', finStaff));
  assert.throws(() => assertCongregationOwner('church-a', staff));
  assert.throws(() => assertCongregationOwner('church-a', revokedOwner));
  assert.throws(() => assertCongregationOwner('church-a', ownerB));
  assert.throws(() => assertCongregationOwner('church-a', null));
});

test('Sequential Member and Family codes increment accurately', () => {
  assert.equal(generateSequentialCode('JMT', ['JMT-2026-0001', 'JMT-2026-0009'], 2026), 'JMT-2026-0010');
  assert.equal(generateSequentialCode('KLG', [], 2026), 'KLG-2026-0001');
});

test('Member form validation respects Owner-configured required fields without requiring unnecessary PII', () => {
  const minimalOk = validateMemberForm({fullName: 'Maria Tan', status: 'active'}, ['fullName', 'status']);
  assert.equal(minimalOk.valid, true);

  const strictPhoneFail = validateMemberForm(
    {fullName: 'Maria Tan', status: 'active', phone: ''},
    ['fullName', 'status', 'phone'],
  );
  assert.equal(strictPhoneFail.valid, false);
  assert.ok(strictPhoneFail.errors.some((e) => e.includes('telepon')));
});

test('filterAndSortMembers filters by search, status, family, and archive flag safely', () => {
  const members = [
    makeMember({id: 'm1', fullName: 'Budi Santoso', status: 'active', familyGroupId: 'fam-1', archived: false}),
    makeMember({id: 'm2', fullName: 'Citra Lestari', status: 'inactive', familyGroupId: 'fam-2', archived: false}),
    makeMember({id: 'm3', fullName: 'Arsip Lama', status: 'moved', archived: true}),
  ];

  const activeSearch = filterAndSortMembers(members, {search: 'budi', archived: false});
  assert.equal(activeSearch.length, 1);
  assert.equal(activeSearch[0].id, 'm1');

  const archivedOnly = filterAndSortMembers(members, {archived: true});
  assert.equal(archivedOnly.length, 1);
  assert.equal(archivedOnly[0].id, 'm3');
});

test('computeCongregationStats computes counts, monthly growth, and family distribution', () => {
  const members = [
    makeMember({id: 'm1', status: 'active', joinedDate: '2026-10-05', familyGroupName: 'Keluarga Wijaya'}),
    makeMember({id: 'm2', status: 'inactive', joinedDate: '2026-11-01', familyGroupName: 'Keluarga Wijaya'}),
    makeMember({id: 'm3', status: 'moved', archived: true}),
  ];
  const families: FamilyGroup[] = [
    {
      id: 'fam-1',
      churchId: 'church-a',
      ownerUid: 'owner-a',
      familyCode: 'KLG-2026-0001',
      name: 'Keluarga Wijaya',
      archived: false,
      createdBy: 'owner-a',
      updatedBy: 'owner-a',
    },
  ];
  const stats = computeCongregationStats(members, families);
  assert.equal(stats.totalNonArchived, 2);
  assert.equal(stats.active, 1);
  assert.equal(stats.inactive, 1);
  assert.equal(stats.archived, 1);
  assert.equal(stats.familyCount, 1);
  assert.equal(stats.monthlyGrowth.length, 2);
});

test('CSV parser, export roundtrip, and duplicate detection work accurately', () => {
  const existing = [makeMember({fullName: 'Andreas Wijaya', email: 'andreas@gereja.id', phone: '08123456789'})];
  const csv = [
    'Nama Lengkap,Email,Telepon,Status,Alamat',
    '"Andreas Wijaya",andreas@gereja.id,08123456789,Aktif,"Jl. Sudirman No. 1, Jakarta"',
    '"Siti Rahmawati",siti@gereja.id,08198765432,Tamu,"Jl. Melati No. 4"',
  ].join('\n');

  const matrix = parseCsvText(csv);
  assert.equal(matrix.length, 3);
  const parsed = mapMatrixToImportRows(matrix, existing);
  assert.equal(parsed.length, 2);
  assert.ok(parsed[0].duplicateReason !== null);
  assert.equal(parsed[1].duplicateReason, null);
  assert.equal(parsed[1].status, 'visiting');

  const exported = buildCsvExport(existing);
  assert.ok(exported.includes('Andreas Wijaya'));
  assert.ok(exported.includes('JMT-2026-0001'));
});
