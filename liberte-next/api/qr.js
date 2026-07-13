import { getSql } from './_lib/sql.js';
import { applyCors, sendJson } from './_lib/http.js';
import { resolveSession } from './_lib/session.js';
import { createCustomerQrToken, formatQrPayload, resolveQrSigningSecret } from './_lib/qrToken.js';

// Üye QR üret — oturum zorunlu
export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'POST gerekli' });
  }

  const action = String(req.query?.action || 'generate').trim().toLowerCase();
  if (action !== 'generate') {
    return sendJson(res, 404, { ok: false, error: 'Bilinmeyen action' });
  }

  const sql = getSql();
  if (!sql) {
    return sendJson(res, 503, { ok: false, error: 'Veritabanı yapılandırılmadı' });
  }

  try {
    const session = await resolveSession(sql, req);
    if (!session) {
      return sendJson(res, 401, { ok: false, error: 'Oturum gerekli' });
    }

    const { secret } = resolveQrSigningSecret();
    if (!secret) {
      return sendJson(res, 503, { ok: false, error: 'QR imza anahtarı yapılandırılmadı' });
    }

    const created = createCustomerQrToken(session.customerId);
    return sendJson(res, 200, {
      ok: true,
      token: created.token,
      payload: formatQrPayload(created.token),
      expiresAt: created.expiresAt,
      ttlSeconds: created.ttlSeconds
    });
  } catch (error) {
    console.error('[n-qr]', error?.message || error);
    return sendJson(res, 500, { ok: false, error: 'Sunucu hatası' });
  }
}
