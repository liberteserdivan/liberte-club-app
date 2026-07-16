import { createHash, randomBytes } from 'node:crypto';
import { readBearerToken } from './http.js';

// Token SHA-256 hash
export function hashToken(token) {
  return createHash('sha256').update(String(token || '')).digest('hex');
}

// Bearer'dan auth token
export function readAuthToken(req) {
  return readBearerToken(req);
}

// Yeni oturum oluştur — auth_sessions
export async function createSession(sql, { customerId, role = 'user', deviceId = '' }) {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const safeRole = role === 'admin' ? 'admin' : 'user';
  const adminVerified = safeRole === 'admin';
  await sql`
    INSERT INTO auth_sessions (token_hash, customer_id, role, device_id, expires_at, admin_verified)
    VALUES (
      ${tokenHash},
      ${Number(customerId)},
      ${safeRole},
      ${deviceId || null},
      now() + interval '30 days',
      ${adminVerified}
    )
  `;
  return {
    token,
    customerId: Number(customerId),
    role: safeRole,
    isAdmin: adminVerified,
    adminVerified
  };
}

// Oturumu sil
export async function destroySession(sql, token) {
  if (!sql || !token) return;
  await sql`DELETE FROM auth_sessions WHERE token_hash = ${hashToken(token)}`;
}

// Bearer token ile oturum çöz
export async function resolveSession(sql, req) {
  const token = readAuthToken(req);
  if (!sql || !token) return null;
  const rows = await sql`
    SELECT customer_id, role, admin_verified, expires_at
    FROM auth_sessions
    WHERE token_hash = ${hashToken(token)}
      AND expires_at > now()
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  const isAdmin = row.role === 'admin' || Boolean(row.admin_verified);
  return {
    token,
    customerId: Number(row.customer_id),
    role: row.role,
    isAdmin,
    adminVerified: isAdmin,
    expiresAt: row.expires_at
  };
}
