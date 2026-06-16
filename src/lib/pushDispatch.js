// Push bildirimi gönder — hedef kitle + FCM (sunucu tarafı)
import { resolvePushAudience } from './pushAudience.js';
import { pruneInvalidPushTokens } from './pushTokens.js';
import { apiFetch } from './apiClient.js';
import { reportApiError, reportError } from './errorHub.js';

export async function dispatchPush(db, commit, { title, body, audience = 'all', customerId = null }) {
  const resolved = resolvePushAudience(db, audience);
  const createdAt = new Date().toLocaleString('tr-TR');
  const logId = Date.now();

  const notification = {
    id: logId,
    title,
    body,
    audience,
    audienceLabel: resolved.audienceLabel,
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
        audience,
        audienceLabel: resolved.audienceLabel,
        targetUserCount: resolved.targetUserCount,
        deviceCount: resolved.deviceCount,
        sent: 0,
        failed: 0,
        note: '',
        createdAt
      },
      ...(db.pushLog || [])
    ].slice(0, 30)
  };

  commit(next);

  if (resolved.disabled) {
    return {
      ok: false,
      sent: 0,
      failed: 0,
      note: resolved.disabledReason || 'Hedef kitle kullanılamıyor.'
    };
  }

  if (!resolved.deviceCount) {
    return {
      ok: true,
      sent: 0,
      failed: 0,
      note: 'Seçilen hedef kitlede kayıtlı cihaz yok. Bildirim uygulama içi kaydedildi.'
    };
  }

  try {
    const response = await apiFetch('/api/push/send', {
      method: 'POST',
      body: JSON.stringify({ title, body, audience })
    });

    let result = {};
    try {
      result = await response.json();
    } catch {
      return {
        ok: false,
        sent: 0,
        failed: 0,
        note: `Push sunucusu geçersiz yanıt döndü (HTTP ${response.status}).`
      };
    }

    const note = result.note
      || result.error
      || `${result.sent || 0} cihaza iletildi${result.failed ? `, ${result.failed} başarısız` : ''}.`;

    if (!response.ok || result.ok === false) {
      reportApiError({
        source: 'push.dispatch',
        response,
        data: result,
        userMessage: note,
        level: result.failed ? 'warn' : 'error',
        showToast: false
      });
    }

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
          ? {
            ...row,
            sent: result.sent || 0,
            failed: result.failed || 0,
            deviceCount: result.deviceCount ?? row.deviceCount,
            targetUserCount: result.targetUserCount ?? row.targetUserCount,
            note
          }
          : row
      ))
    });

    return {
      ok: response.ok && result.ok !== false,
      sent: result.sent || 0,
      failed: result.failed || 0,
      note,
      removedInvalid: removed
    };
  } catch (error) {
    reportError({
      source: 'push.dispatch',
      message: error?.message || 'Push request failed',
      userMessage: 'Push sunucusuna ulaşılamadı.',
      showToast: false,
      persist: true
    });
    return {
      ok: false,
      sent: 0,
      failed: 0,
      note: 'Uygulama içi kaydedildi. Push sunucusuna ulaşılamadı.'
    };
  }
}
