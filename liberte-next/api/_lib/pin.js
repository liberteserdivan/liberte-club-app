import { pbkdf2, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cleanPhone, phoneLookupVariants } from './phone.js';
import { inList } from './sqlIn.js';

const pbkdf2Async = promisify(pbkdf2);
const PIN_ITERATIONS = 120000;
const PIN_KEYLEN = 64;
const PIN_DIGEST = 'sha512';
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 10;

// PIN rakamlarını temizle
export function normalizePin(pin) {
  return String(pin || '').replace(/\D/g, '');
}

// PIN 4 veya 6 hane mi
export function isValidPinFormat(pin) {
  const value = normalizePin(pin);
  return value.length === 4 || value.length === 6;
}

// Hash doğrula
async function verifyPinHash(pin, salt, hash) {
  const computed = await pbkdf2Async(
    normalizePin(pin),
    salt,
    PIN_ITERATIONS,
    PIN_KEYLEN,
    PIN_DIGEST
  );
  const expected = Buffer.from(hash, 'hex');
  if (computed.length !== expected.length) return false;
  return timingSafeEqual(computed, expected);
}

function isLocked(row) {
  if (!row?.locked_until) return false;
  return new Date(row.locked_until).getTime() > Date.now();
}

function lockMinutesLeft(lockedUntil) {
  const ms = new Date(lockedUntil).getTime() - Date.now();
  return Math.max(1, Math.ceil(ms / 60000));
}

// PIN satırını telefon varyantlarıyla bul
async function resolvePinAuthRow(sql, phone) {
  const normalizedPhone = cleanPhone(phone);
  const variants = phoneLookupVariants(phone);
  const rows = await sql`
    SELECT pin_hash, pin_salt, failed_attempts, locked_until, phone, customer_id
    FROM customer_pin_auth
    WHERE phone IN ${inList(sql, variants)}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  if (row.phone !== normalizedPhone) {
    await sql`
      UPDATE customer_pin_auth
      SET phone = ${normalizedPhone}, updated_at = now()
      WHERE phone = ${row.phone}
    `;
  }
  return row;
}

// Müşteri PIN doğrula — deneme / kilit
export async function verifyCustomerPin(sql, phone, pin) {
  const normalizedPhone = cleanPhone(phone);
  const row = await resolvePinAuthRow(sql, phone);
  if (!row) {
    return {
      ok: false,
      status: 404,
      code: 'PIN_NOT_FOUND',
      error: 'Bu hesap için PIN tanımlı değil.'
    };
  }
  if (isLocked(row)) {
    return {
      ok: false,
      status: 429,
      error: `Çok fazla hatalı deneme. ${lockMinutesLeft(row.locked_until)} dakika sonra tekrar dene.`,
      lockedUntil: row.locked_until
    };
  }
  if (!isValidPinFormat(pin)) {
    return { ok: false, status: 400, error: 'PIN 4 veya 6 haneli olmalı.' };
  }
  const valid = await verifyPinHash(pin, row.pin_salt, row.pin_hash);
  if (valid) {
    await sql`
      UPDATE customer_pin_auth
      SET failed_attempts = 0, locked_until = NULL, updated_at = now()
      WHERE phone = ${normalizedPhone}
    `;
    return { ok: true, customerId: row.customer_id != null ? Number(row.customer_id) : null };
  }
  const nextAttempts = Number(row.failed_attempts || 0) + 1;
  const exhausted = nextAttempts >= MAX_ATTEMPTS;
  if (exhausted) {
    await sql`
      UPDATE customer_pin_auth
      SET failed_attempts = ${nextAttempts},
          locked_until = now() + interval '10 minutes',
          updated_at = now()
      WHERE phone = ${normalizedPhone}
    `;
    return {
      ok: false,
      status: 429,
      error: `Çok fazla hatalı deneme. Hesap ${LOCK_MINUTES} dakika kilitlendi.`
    };
  }
  await sql`
    UPDATE customer_pin_auth
    SET failed_attempts = ${nextAttempts}, updated_at = now()
    WHERE phone = ${normalizedPhone}
  `;
  return {
    ok: false,
    status: 401,
    code: 'PIN_INVALID',
    error: `PIN hatalı. Kalan deneme: ${MAX_ATTEMPTS - nextAttempts}.`
  };
}
