import { readAuthToken, verifyAdminPin } from './auth.js';
import { getSql } from './appState.js';
import { createHash } from 'node:crypto';

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 10;

// Token hash üret
function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

// Admin PIN deneme sütunlarını hazırla
async function ensureAdminPinColumns(sql) {
  await sql`ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS admin_pin_failed int NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS admin_pin_locked_until timestamptz`;
}

// Kilit süresini dakika olarak hesapla
function lockMinutesLeft(lockedUntil) {
  const ms = new Date(lockedUntil).getTime() - Date.now();
  return Math.max(1, Math.ceil(ms / 60000));
}

// Yönetici PIN denemesini doğrula — brute force korumalı
export async function verifyAdminPinAttempt(req, pin) {
  const token = readAuthToken(req);
  if (!token) {
    return { ok: false, status: 401, error: 'Oturum gerekli' };
  }

  const sql = getSql();
  if (!sql) {
    return { ok: false, status: 503, error: 'Veritabanı yapılandırılmadı' };
  }

  await ensureAdminPinColumns(sql);
  const tokenHash = hashToken(token);
  const rows = await sql`
    SELECT admin_pin_failed, admin_pin_locked_until
    FROM auth_sessions
    WHERE token_hash = ${tokenHash}
      AND expires_at > now()
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) {
    return { ok: false, status: 401, error: 'Oturum geçersiz' };
  }

  if (row.admin_pin_locked_until && new Date(row.admin_pin_locked_until).getTime() > Date.now()) {
    return {
      ok: false,
      status: 429,
      error: `Çok fazla hatalı deneme. ${lockMinutesLeft(row.admin_pin_locked_until)} dk sonra tekrar dene.`,
      lockedUntil: row.admin_pin_locked_until
    };
  }

  if (!verifyAdminPin(pin)) {
    const failed = Number(row.admin_pin_failed || 0) + 1;
    const lockedUntil = failed >= MAX_ATTEMPTS
      ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString()
      : null;

    await sql`
      UPDATE auth_sessions
      SET admin_pin_failed = ${failed},
          admin_pin_locked_until = ${lockedUntil}
      WHERE token_hash = ${tokenHash}
    `;

    if (lockedUntil) {
      return {
        ok: false,
        status: 429,
        error: `Çok fazla hatalı deneme. ${LOCK_MINUTES} dk bekleyin.`,
        lockedUntil
      };
    }

    return { ok: false, status: 401, error: 'Yönetici PIN hatalı' };
  }

  await sql`
    UPDATE auth_sessions
    SET admin_pin_failed = 0,
        admin_pin_locked_until = NULL
    WHERE token_hash = ${tokenHash}
  `;

  return { ok: true };
}
