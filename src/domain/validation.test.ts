import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hashAppPin,
  isValidFirestoreId,
  sanitizeSlugId,
  validateChurchInput,
  validateInvitationInput,
  validatePasswordStrength,
  validatePinCode,
} from './validation';
import {formatCurrency, formatDateID} from '../utils/formatting';

test('ID and slug validation rejects poisoning payloads', () => {
  assert.equal(isValidFirestoreId('church-gki-jakarta'), true);
  assert.equal(isValidFirestoreId('../etc/passwd'), false);
  assert.equal(isValidFirestoreId('a'.repeat(200)), false);
  assert.equal(sanitizeSlugId('Gereja Kristen Kemuliaan Jakarta!'), 'gereja-kristen-kemuliaan-jakarta');
});

test('Church creation validation enforces length and supported currency/language', () => {
  assert.equal(
    validateChurchInput({
      name: 'Gereja Higayon Jakarta',
      city: 'Jakarta Selatan',
      country: 'Indonesia',
      currency: 'IDR',
      language: 'id',
    }).valid,
    true,
  );
  assert.equal(
    validateChurchInput({
      name: 'AB',
      city: 'Jakarta',
      country: 'Indonesia',
      currency: 'IDR',
      language: 'id',
    }).valid,
    false,
  );
});

test('Invitation validation forbids granting finance permissions to church_staff', () => {
  assert.equal(
    validateInvitationInput({
      email: 'staf@gereja.id',
      role: 'church_staff',
      financePermissions: ['finance:read'],
    }).valid,
    false,
  );
  assert.equal(
    validateInvitationInput({
      email: 'bendahara@gereja.id',
      role: 'finance_manager',
      financePermissions: ['finance:read', 'finance:approve'],
    }).valid,
    true,
  );
});

test('Password and PIN validation enforce strong security baselines', async () => {
  assert.equal(validatePasswordStrength('weak').valid, false);
  assert.equal(validatePasswordStrength('Higayon2026').valid, true);
  assert.equal(validatePinCode('123456').valid, false);
  assert.equal(validatePinCode('849203').valid, true);

  const hash1 = await hashAppPin('849203', 'uid-1');
  const hash2 = await hashAppPin('849203', 'uid-2');
  assert.equal(hash1.length, 64);
  assert.notEqual(hash1, hash2);
});

test('Indonesian currency and Asia/Jakarta date formatting render accurately', () => {
  const formattedIdr = formatCurrency(1500000, 'IDR', 'id-ID');
  assert.ok(formattedIdr.includes('1.500.000'));
  const formattedDate = formatDateID('2026-11-16T00:00:00Z', 'Asia/Jakarta', 'id-ID');
  assert.ok(formattedDate.includes('2026'));
});
