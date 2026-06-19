import { applyCors } from '../http.js';
import { destroySession, getSession } from '../auth.js';

// Oturum okuma ve çıkış
export async function handleAuthSession(req, res) {
  applyCors(req, res, 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    try {
      await destroySession(req, res);
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message || 'Çıkış yapılamadı' });
    }
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const session = await getSession(req);
    if (!session?.customer) return res.status(200).json({ ok: false });

    return res.status(200).json({
      ok: true,
      customerId: session.customerId,
      role: session.role,
      isAdmin: session.isAdmin,
      adminVerified: session.adminVerified,
      customer: session.customer,
      loyalty: session.loyalty || null
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Oturum okunamadı' });
  }
}
