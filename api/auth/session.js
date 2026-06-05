import { applyCors } from '../lib/http.js';
import { destroySession, getSession } from '../lib/auth.js';
import { loadAppState } from '../lib/appState.js';

export default async function handler(req, res) {
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
    if (!session) return res.status(200).json({ ok: false });

    const remote = await loadAppState();
    const customer = (remote.data?.customers || []).find(
      (c) => Number(c.id) === Number(session.customerId)
    );

    if (!customer) return res.status(200).json({ ok: false });

    return res.status(200).json({
      ok: true,
      customerId: session.customerId,
      role: session.role,
      isAdmin: session.isAdmin,
      adminVerified: session.adminVerified,
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email
      }
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Oturum okunamadı' });
  }
}
