import { applyCors, readBody } from '../http.js';
import {
  getSession,
  markAdminVerified,
  requireSession
} from '../auth.js';
import { verifyAdminPinAttempt } from '../adminPinAuth.js';
import { withRealtimeToken } from '../supabaseRealtimeJwt.js';

// Yönetici PIN doğrulama — brute force korumalı
export async function handleAuthAdminPin(req, res) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const session = await requireSession(req, res);
    if (!session) return;
    if (!session.isAdmin) return res.status(403).json({ error: 'Yönetici yetkisi yok' });

    if (!process.env.ADMIN_PIN && !process.env.CASHIER_PIN) {
      return res.status(503).json({ error: 'ADMIN_PIN Vercel ortamında tanımlı değil' });
    }

    const body = readBody(req);
    const pin = String(body.pin || '').trim();
    const attempt = await verifyAdminPinAttempt(req, pin);

    if (!attempt.ok) {
      return res.status(attempt.status || 401).json({
        error: attempt.error,
        lockedUntil: attempt.lockedUntil || null
      });
    }

    await markAdminVerified(req);
    const fresh = await getSession(req);

    return res.status(200).json(withRealtimeToken({
      ok: true,
      adminVerified: Boolean(fresh?.adminVerified)
    }, fresh));
  } catch (e) {
    return res.status(500).json({ error: e.message || 'PIN doğrulanamadı' });
  }
}
