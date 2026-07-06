import { applyCors, publicErrorMessage } from '../http.js';
import {
  getSession,
  markAdminVerified,
  requireSession
} from '../auth.js';
import { withRealtimeToken } from '../supabaseRealtimeJwt.js';

// Geriye uyumluluk — ayrı admin PIN artık zorunlu değil
export async function handleAuthAdminPin(req, res) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const session = await requireSession(req, res);
    if (!session) return;
    if (!session.isAdmin) return res.status(403).json({ error: 'Yönetici yetkisi yok' });

    await markAdminVerified(req);
    const fresh = await getSession(req);

    return res.status(200).json(withRealtimeToken({
      ok: true,
      adminVerified: Boolean(fresh?.adminVerified ?? session.isAdmin)
    }, fresh || session));
  } catch (e) {
    return res.status(500).json({ error: publicErrorMessage(e, 'Yönetici oturumu doğrulanamadı') });
  }
}
