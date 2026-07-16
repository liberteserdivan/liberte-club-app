import { applyCors, readBodySafe } from '../http.js';
import { requireAdminSession } from '../auth.js';
import { loadAppState, saveAppState, getSql } from '../appState.js';
import { useRelationalState } from '../relationalConfig.js';
import {
  deactivateAllPushSubscriptions,
  deactivatePushTokens,
  loadPushSubscriptionsFromSql
} from '../pushStore.js';
import { sanitizePushSubscriptions } from '../../../src/lib/pushSubscriptionSanitize.js';

// jsonb modunda push kayıtlarını güncelle
async function persistLegacyPushSubscriptions(data, subscriptions) {
  await saveAppState({
    ...data,
    pushSubscriptions: subscriptions
  });
}

// Relational modda eski/pasif kayıtları SQL üzerinden temizle
async function sanitizeRelationalPushSubscriptions(sql) {
  const beforeRows = await loadPushSubscriptionsFromSql(sql);
  const cleaned = sanitizePushSubscriptions(beforeRows);
  const keptTokens = new Set(cleaned.subscriptions.map((row) => row.token).filter(Boolean));
  const removedTokens = beforeRows
    .map((row) => row.token)
    .filter((token) => token && !keptTokens.has(token));

  if (removedTokens.length) {
    await deactivatePushTokens(sql, removedTokens);
  }

  return {
    before: beforeRows.length,
    after: cleaned.subscriptions.length,
    removed: cleaned.summary.removed,
    summary: cleaned.summary
  };
}

// Admin — push cihaz kayıtlarını temizle veya sıfırla
export async function handleAdminPushCleanup(req, res) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const adminSession = await requireAdminSession(req, res);
    if (!adminSession) return;

    const body = readBodySafe(req);
    const reset = String(body?.mode || '').trim().toLowerCase() === 'reset';
    const removeTokens = Array.isArray(body?.tokens)
      ? [...new Set(body.tokens.map((token) => String(token || '').trim()).filter(Boolean))]
      : [];

    if (useRelationalState()) {
      const sql = getSql();
      if (!sql) {
        return res.status(500).json({ ok: false, error: 'Veritabanı yapılandırması eksik' });
      }

      if (reset) {
        const before = (await loadPushSubscriptionsFromSql(sql)).length;
        const removed = await deactivateAllPushSubscriptions(sql);
        return res.status(200).json({
          ok: true,
          mode: 'reset',
          remaining: 0,
          removed: removed || before,
          summary: { before, after: 0, removed: removed || before, reset: true, reasons: {} }
        });
      }

      if (removeTokens.length) {
        const before = (await loadPushSubscriptionsFromSql(sql)).length;
        const removed = await deactivatePushTokens(sql, removeTokens);
        return res.status(200).json({
          ok: true,
          mode: 'remove',
          remaining: Math.max(0, before - removed),
          removed,
          summary: { before, after: Math.max(0, before - removed), removed, reset: false, reasons: {} }
        });
      }

      const summary = await sanitizeRelationalPushSubscriptions(sql);
      return res.status(200).json({
        ok: true,
        mode: 'sanitize',
        remaining: summary.after,
        removed: summary.removed,
        summary
      });
    }

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
      await persistLegacyPushSubscriptions(remote.data, subscriptions);
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
