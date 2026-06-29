import { pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cleanPhone, phoneLookupVariants } from './phone.js';
import { inList } from './sqlIn.js';
import { ensureSchemaReady } from './schemaReady.js';

// B-1: pbkdf2'nin ASENKRON sürümü. Senkron pbkdf2Sync, 120k iterasyonla event
// loop'u ~50-150ms bloklayıp eşzamanlı tüm istekleri sıraya sokuyordu. Async
// sürüm libuv thread havuzunda çalışır; giriş/kayıt eşzamanlılığını korur.
const pbkdf2Async = promisify(pbkdf2);

const PIN_ITERATIONS = 120000;
const PIN_KEYLEN = 64;
const PIN_DIGEST = 'sha512';
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 10;

// PIN tablosunu hazırla
export async function ensurePinTable(sql) {
  await ensureSchemaReady(sql);
}

// PIN formatını doğrula — 4 veya 6 hane
export function normalizePin(pin) {
  return String(pin || '').replace(/\D/g, '');
}

export function isValidPinFormat(pin) {
  const value = normalizePin(pin);
  return value.length === 4 || value.length === 6;
}

// PIN hash üret — düz metin saklanmaz (asenkron)
export async function hashPin(pin) {
  const salt = randomBytes(16).toString('hex');
  const derived = await pbkdf2Async(
    normalizePin(pin),
    salt,
    PIN_ITERATIONS,
    PIN_KEYLEN,
    PIN_DIGEST
  );
  return { salt, hash: derived.toString('hex') };
}

// PIN doğrula (asenkron)
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

// Hesap kilitli mi kontrol et
function isLocked(row) {
  if (!row?.locked_until) return false;
  return new Date(row.locked_until).getTime() > Date.now();
}

// Kilit süresini dakika olarak hesapla
function lockMinutesLeft(lockedUntil) {
  const ms = new Date(lockedUntil).getTime() - Date.now();
  return Math.max(1, Math.ceil(ms / 60000));
}

// Müşteri PIN kaydı oluştur veya güncelle
export async function saveCustomerPin(sql, phone, customerId, pin) {
  await ensurePinTable(sql);
  const normalizedPhone = cleanPhone(phone);
  const { salt, hash } = await hashPin(pin);

  await sql`
    INSERT INTO customer_pin_auth (phone, customer_id, pin_hash, pin_salt, failed_attempts, locked_until, updated_at)
    VALUES (${normalizedPhone}, ${customerId}, ${hash}, ${salt}, 0, NULL, now())
    ON CONFLICT (phone) DO UPDATE SET
      customer_id = EXCLUDED.customer_id,
      pin_hash = EXCLUDED.pin_hash,
      pin_salt = EXCLUDED.pin_salt,
      failed_attempts = 0,
      locked_until = NULL,
      updated_at = now()
  `;
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

// Müşteri PIN doğrula — deneme sayısı ve kilit yönetimi
export async function verifyCustomerPin(sql, phone, pin) {
  await ensurePinTable(sql);
  const normalizedPhone = cleanPhone(phone);

  const row = await resolvePinAuthRow(sql, phone);
  if (!row) {
    return {
      ok: false,
      status: 404,
      code: 'PIN_NOT_FOUND',
      error: 'Bu hesap için PIN tanımlı değil. PIN sıfırlama ile yeni PIN belirle.'
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
    return { ok: true };
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
      error: `Çok fazla hatalı deneme. Hesap ${LOCK_MINUTES} dakika kilitlendi.`,
      lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60000).toISOString()
    };
  }

  await sql`
    UPDATE customer_pin_auth
    SET failed_attempts = ${nextAttempts}, updated_at = now()
    WHERE phone = ${normalizedPhone}
  `;

  const remaining = MAX_ATTEMPTS - nextAttempts;
  return {
    ok: false,
    status: 401,
    code: 'PIN_INVALID',
    error: `PIN hatalı. Kalan deneme: ${remaining}.`
  };
}
