import { applyCors, readBodySafe } from '../http.js';
import { requireSession } from '../auth.js';
import { applyDailyLoginRewardRelational } from '../customerRewards.js';
import { logServerError } from '../logServerError.js';

// Günlük giriş LP ödülü — sunucuda kalıcı
export async function handleDailyLoginClaim(req, res) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = await requireSession(req, res);
  if (!session?.customerId) return;

  try {
    readBodySafe(req);
    const result = await applyDailyLoginRewardRelational(session.customerId);

    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.error || 'Ödül alınamadı' });
    }

    return res.status(200).json({
      ok: true,
      message: result.message,
      loyalty: result.loyalty,
      dailyClaims: result.dailyClaims
    });
  } catch (error) {
    await logServerError({
      source: 'loyalty.daily-claim',
      error,
      customerId: session.customerId
    });
    return res.status(500).json({ ok: false, error: 'Günlük ödül kaydedilemedi' });
  }
}
