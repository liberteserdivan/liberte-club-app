import { applyCors } from '../http.js';
import { requireSession } from '../auth.js';

// Günlük giriş ödülü kaldırıldı — eski istemciler LP basamasın
export async function handleDailyLoginClaim(req, res) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = await requireSession(req, res);
  if (!session?.customerId) return;

  return res.status(410).json({
    ok: false,
    code: 'DAILY_CLAIM_DISABLED',
    error: 'Günlük giriş ödülü artık sunulmuyor.'
  });
}
