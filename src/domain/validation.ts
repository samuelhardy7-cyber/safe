import type {ChurchRole, CurrencyCode, LanguageCode} from '../types/domain';

export const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function isValidFirestoreId(id: string, minLen = 1, maxLen = 128): boolean {
  return (
    typeof id === 'string' &&
    id.length >= minLen &&
    id.length <= maxLen &&
    VALID_ID_REGEX.test(id)
  );
}

export function sanitizeSlugId(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return cleaned.length >= 3 ? cleaned : `gereja-${Math.random().toString(36).slice(2, 8)}`;
}

export function validateChurchInput(input: {
  name: string;
  denomination?: string;
  city: string;
  country: string;
  currency: CurrencyCode;
  language: LanguageCode;
}): ValidationResult {
  const name = input.name.trim();
  const city = input.city.trim();
  const country = input.country.trim();
  const denom = (input.denomination || '').trim();

  if (name.length < 3 || name.length > 160) {
    return {valid: false, error: 'Nama gereja harus antara 3 hingga 160 karakter.'};
  }
  if (denom.length > 120) {
    return {valid: false, error: 'Nama sinode/denominasi maksimal 120 karakter.'};
  }
  if (city.length < 2 || city.length > 100) {
    return {valid: false, error: 'Kota harus diisi (2–100 karakter).'};
  }
  if (country.length < 2 || country.length > 80) {
    return {valid: false, error: 'Negara harus diisi (2–80 karakter).'};
  }
  if (!['IDR', 'USD', 'SGD'].includes(input.currency)) {
    return {valid: false, error: 'Mata uang tidak didukung.'};
  }
  if (!['id', 'en'].includes(input.language)) {
    return {valid: false, error: 'Bahasa tidak didukung.'};
  }
  return {valid: true};
}

export function validateInvitationInput(input: {
  email: string;
  role: Exclude<ChurchRole, 'owner'>;
  financePermissions: string[];
}): ValidationResult {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(email) || email.length > 200) {
    return {valid: false, error: 'Alamat email undangan tidak valid.'};
  }
  if (!['finance_manager', 'finance_staff', 'church_staff'].includes(input.role)) {
    return {valid: false, error: 'Peran undangan tidak valid.'};
  }
  if (input.role === 'church_staff' && input.financePermissions.length > 0) {
    return {
      valid: false,
      error: 'Church Staff tidak boleh diberikan izin keuangan.',
    };
  }
  if (
    (input.role === 'finance_manager' || input.role === 'finance_staff') &&
    input.financePermissions.length === 0
  ) {
    return {
      valid: false,
      error: 'Pilih minimal satu izin keuangan eksplisit untuk peran Keuangan.',
    };
  }
  return {valid: true};
}

export function validateProfileInput(input: {
  displayName: string;
  phone?: string;
}): ValidationResult {
  const displayName = input.displayName.trim();
  const phone = (input.phone || '').trim();
  if (displayName.length < 2 || displayName.length > 120) {
    return {valid: false, error: 'Nama lengkap harus antara 2 hingga 120 karakter.'};
  }
  if (phone.length > 32) {
    return {valid: false, error: 'Nomor telepon maksimal 32 karakter.'};
  }
  return {valid: true};
}

export function validatePasswordStrength(password: string): ValidationResult {
  if (password.length < 8) {
    return {valid: false, error: 'Kata sandi minimal 8 karakter.'};
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return {
      valid: false,
      error: 'Kata sandi wajib mengandung huruf besar, huruf kecil, dan angka.',
    };
  }
  return {valid: true};
}

export function validatePinCode(pin: string): ValidationResult {
  if (!/^\d{6}$/.test(pin)) {
    return {valid: false, error: 'PIN aplikasi harus berupa tepat 6 digit angka.'};
  }
  if (/^(\d)\1{5}$/.test(pin) || pin === '123456' || pin === '654321') {
    return {valid: false, error: 'Gunakan kombinasi PIN yang tidak mudah ditebak.'};
  }
  return {valid: true};
}

/**
 * Hashes an application PIN with SHA-256 salted by UID so raw PIN is never stored in Firestore.
 * Note: Application PIN is strictly a secondary local-session convenience lock, never replacing Firebase Auth.
 */
export async function hashAppPin(pin: string, uid: string): Promise<string> {
  const payload = new TextEncoder().encode(`higayon-pin:${uid}:${pin}`);
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', payload);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
