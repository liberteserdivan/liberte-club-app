import { pruneExpiredQrNonces } from './qrNonceStore.js';

const PURGE_BATCH = 500;

// Süresi dolan auth bakım kayıtlarını temizle (Guardian cron).
// LIMIT'li siler — tek cron turunda kilitlenme riskini azaltır.
export async function purgeExpiredAuthData(sql) {
  if (!sql) return { sessions: 0, rateLimits: 0, qrNonces: 0 };

  const sessions = await sql`
    DELETE FROM auth_sessions
    WHERE ctid IN (
      SELECT ctid FROM auth_sessions
      WHERE expires_at < now()
      LIMIT ${PURGE_BATCH}
    )
    RETURNING token_hash
  `;

  const rateLimits = await sql`
    DELETE FROM auth_rate_limits
    WHERE ctid IN (
      SELECT ctid FROM auth_rate_limits
      WHERE window_start < now() - interval '1 day'
      LIMIT ${PURGE_BATCH}
    )
    RETURNING action
  `;

  const qrNonces = await pruneExpiredQrNonces(sql);

  return {
    sessions: sessions.length,
    rateLimits: rateLimits.length,
    qrNonces: Number(qrNonces) || 0
  };
}
