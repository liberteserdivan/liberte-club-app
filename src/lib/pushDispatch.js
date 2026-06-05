// Push bildirimi gönder — uygulama içi kayıt + FCM
import { pruneInvalidPushTokens } from './pushTokens.js';

export async function dispatchPush(db, commit, { title, body, customerId = null }) {
  const tokens = (db.pushSubscriptions || []).map((x) => x.token).filter(Boolean);
  const createdAt = new Date().toLocaleString('tr-TR');
  const logId = Date.now();

  const notification = {
    id: logId,
    title,
    body,
    createdAt,
    ...(customerId ? { customerId } : {})
  };

  const next = {
    ...db,
    notifications: [notification, ...(db.notifications || [])],
    pushLog: [
      {
        id: logId,
        title,
        body,
        deviceCount: tokens.length,
        sent: 0,
        failed: 0,
        note: '',
        createdAt
      },
      ...(db.pushLog || [])
    ].slice(0, 30)
  };

  commit(next);

  if (!tokens.length) {
    return { ok: true, sent: 0, note: 'Kayıtlı cihaz yok. Bildirim uygulama içi kaydedildi.' };
  }

  try {
    const response = await fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokens, title, body })
    });

    let result = {};
    try {
      result = await response.json();
    } catch {
      return {
        ok: false,
        sent: 0,
        note: `Push sunucusu geçersiz yanıt döndü (HTTP ${response.status}).`
      };
    }

    const note = result.note
      || result.error
      || `${result.sent || 0} cihaza iletildi${result.failed ? `, ${result.failed} başarısız` : ''}.`;

    const { subscriptions, removed } = pruneInvalidPushTokens(
      next.pushSubscriptions || [],
      result.invalidTokens || []
    );

    const synced = removed
      ? { ...next, pushSubscriptions: subscriptions }
      : next;

    commit({
      ...synced,
      pushLog: synced.pushLog.map((row) => (
        row.id === logId
          ? { ...row, sent: result.sent || 0, failed: result.failed || 0, note }
          : row
      ))
    });

    return { ok: response.ok && result.ok !== false, sent: result.sent || 0, note, removedInvalid: removed };
  } catch {
    return { ok: false, sent: 0, note: 'Uygulama içi kaydedildi. Push sunucusuna ulaşılamadı.' };
  }
}
