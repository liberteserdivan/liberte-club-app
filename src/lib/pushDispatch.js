// Push bildirimi gönder — hedef kitle + FCM (sunucu tarafı)
import { resolvePushAudience } from './pushAudience.js';
import { pruneInvalidPushTokens } from './pushTokens.js';
import { apiJson, ADMIN_REQUEST_OPTIONS } from './apiClient.js';
import { formatClientApiError } from './apiErrors.js';
import { reportApiError } from './errorHub.js';

const PUSH_SEND_TIMEOUT_MS = ADMIN_REQUEST_OPTIONS.timeoutMs;

// Ref'li hata metni üret
function formatPushErrorMessage(result = {}, error = null) {
  const formatted = formatClientApiError({
    response: result.response || null,
    data: result.data || {},
    error,
    fallback: 'Push gönderilemedi.'
  });
  return formatted.message || 'Push gönderilemedi.';
}

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

  // Uygulama içi kayıt — tam state sync tetikleme
  commit(next, { skipRemote: true });

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
      ok: false,
      sent: 0,
      failed: 0,
      note: 'Seçilen hedef kitlede kayıtlı cihaz yok. Bildirim yalnızca uygulama içi kaydedildi.'
    };
  }

  try {
    const { response, data } = await apiJson('/api/admin?resource=push-send', {
      method: 'POST',
      body: JSON.stringify({ title, body, audience }),
      timeoutMs: PUSH_SEND_TIMEOUT_MS
    });

    const requestId = data?.requestId || null;
    const note = data.note
      || data.message
      || data.error
      || `${data.sent || 0} cihaza iletildi${data.failed ? `, ${data.failed} başarısız` : ''}.`;

    const userNote = data?.ok === false && data?.savedInApp
      ? `${note}${requestId ? ` Ref: ${requestId}` : ''}`
      : (requestId && !note.includes('Ref:') ? `${note} Ref: ${requestId}` : note);

    if (!response.ok || data.ok === false) {
      reportApiError({
        source: 'admin.push.send',
        response,
        data,
        userMessage: userNote,
        level: data.failed ? 'warn' : 'error',
        showToast: false
      });
    }

    const { subscriptions, removed } = pruneInvalidPushTokens(
      next.pushSubscriptions || [],
      data.invalidTokens || []
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
            sent: data.sent || 0,
            failed: data.failed || 0,
            deviceCount: data.deviceCount ?? row.deviceCount,
            targetUserCount: data.targetUserCount ?? row.targetUserCount,
            note: userNote,
            requestId
          }
          : row
      ))
    }, { skipRemote: true });

    return {
      ok: response.ok && data.ok !== false,
      sent: data.sent || 0,
      failed: data.failed || 0,
      note: userNote,
      requestId,
      removedInvalid: removed
    };
  } catch (error) {
    const message = formatPushErrorMessage({}, error);
    const timeoutHint = error?.code === 'FETCH_TIMEOUT'
      ? ' İstek zaman aşımına uğradı; tekrar dene.'
      : '';
    return {
      ok: false,
      sent: 0,
      failed: 0,
      note: message.includes('Ref:')
        ? `Uygulama içi kaydedildi. ${message}`
        : `Uygulama içi kaydedildi. Push sunucusuna ulaşılamadı.${timeoutHint}${message ? ` ${message}` : ''}`
    };
  }
}
