import { applyCors, readBody } from '../lib/http.js';
import {
  getSession,
  markAdminVerified,
  requireSession,
  verifyAdminPin
} from '../lib/auth.js';

export default async function handler(req, res) {
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
    if (!verifyAdminPin(pin)) {
      return res.status(401).json({ error: 'Yönetici PIN hatalı' });
    }

    await markAdminVerified(req);
    const fresh = await getSession(req);

    return res.status(200).json({
      ok: true,
      adminVerified: Boolean(fresh?.adminVerified)
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'PIN doğrulanamadı' });
  }
}
