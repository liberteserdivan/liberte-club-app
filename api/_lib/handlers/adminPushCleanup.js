import { applyCors, readBodySafe } from '../http.js';
import { requireAdminSession } from '../auth.js';
import { loadAppState, saveAppState } from '../appState.js';
import { sanitizePushSubscriptions } from '../../../src/lib/pushSubscriptionSanitize.js';

// Admin — push cihaz kayıtlarını temizle veya sıfırla
export async function handleAdminPushCleanup(req, res) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const adminSession = await requireAdminSession(req, res, { pinRequired: true });
    if (!adminSession) return;

    const body = readBodySafe(req);
    const reset = String(body?.mode || '').trim().toLowerCase() === 'reset';

    const remote = await loadAppState();
    if (!remote.data) {
      return res.status(404).json({ ok: false, error: 'Veri bulunamadı' });
    }

    const before = (remote.data.pushSubscriptions || []).length;
    let subscriptions = [];
    let summary = { before, after: 0, removed: before, reset: true, reasons: {} };

    if (reset) {
      subscriptions = [];
    } else {
      const cleaned = sanitizePushSubscriptions(remote.data.pushSubscriptions || []);
      subscriptions = cleaned.subscriptions;
      summary = cleaned.summary;
    }

    if (reset || summary.removed > 0 || subscriptions.length !== before) {
      await saveAppState({
        ...remote.data,
        pushSubscriptions: subscriptions
      });
    }

    return res.status(200).json({
      ok: true,
      mode: reset ? 'reset' : 'sanitize',
      remaining: subscriptions.length,
      removed: reset ? before : summary.removed,
      summary
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || 'Push kayıtları temizlenemedi'
    });
  }
}
