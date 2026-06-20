import admin from 'firebase-admin';
import { parseServiceAccount, validateServiceAccount } from '../serviceAccount.js';
import { formatPushNotification } from '../pushNotificationText.js';
import { applyCors, readBodySafe } from '../http.js';
import { requireAdminSession } from '../auth.js';
import { loadAppState, saveAppState } from '../appState.js';
import { useRelationalState } from '../relationalConfig.js';
import { composeStateFromRelational } from '../relationalState.js';
import { loadPushSubscriptionsFromSql, deactivatePushTokens, insertPushSendLog } from '../pushStore.js';
import { insertInAppNotificationsForAudience } from '../inAppNotificationStore.js';
import { getSql } from '../sql.js';
import { createRequestTrace } from '../requestTrace.js';
import { resolvePushAudience } from '../../../src/lib/pushAudience.js';
import { sanitizePushSubscriptions } from '../../../src/lib/pushSubscriptionSanitize.js';
import { collectFailedPushTokens, pruneInvalidPushTokens } from '../../../src/lib/pushTokens.js';
import { isValidPrivateKeyPem } from '../fcmProbe.js';

const SITE_ORIGIN = 'https://app.liberte.cafe';

// State içindeki push kayıtlarını güncelle
async function persistPushSubscriptions(state, subscriptions) {
  await saveAppState({
    ...state,
    pushSubscriptions: subscriptions
  });
}

// Gönderim öncesi kayıtları temizle
async function preparePushState(state) {
  const cleaned = sanitizePushSubscriptions(state.pushSubscriptions || []);
  if (cleaned.summary.removed > 0) {
    await persistPushSubscriptions(state, cleaned.subscriptions);
    return { ...state, pushSubscriptions: cleaned.subscriptions };
  }
  return state;
}

// Firebase Admin SDK başlat
function getAdmin(serviceAccount) {
  if (admin.apps.length) return admin;
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id || 'liberte-club'
  });
  return admin;
}

// Hedef cihaz platformlarını özetle
function summarizeTargetPlatforms(subscriptions = []) {
  const counts = { android: 0, ios: 0, web: 0, unknown: 0 };
  subscriptions.forEach((row) => {
    const platform = String(row?.platform || '').toLowerCase();
    if (platform === 'android') counts.android += 1;
    else if (platform === 'ios') counts.ios += 1;
    else if (platform === 'web') counts.web += 1;
    else counts.unknown += 1;
  });
  return counts;
}

// FCM hata kodlarını özetle
function summarizeFailures(responses) {
  return responses
    .filter((row) => !row.success)
    .map((row) => row.error?.code || row.error?.message)
    .filter(Boolean)
    .slice(0, 3)
    .join(', ');
}

// Admin panelinde anlaşılır hata metni
function explainPushFailure(codes = '', platformCounts = null) {
  const text = String(codes || '');
  if (text.includes('messaging/third-party-auth-error')) {
    if (platformCounts?.ios > 0) {
      return 'iOS APNs yapılandırması eksik/hatalı. Firebase Console → Cloud Messaging → Apple → APNs Auth Key (.p8) yükleyin.';
    }
    if (platformCounts?.web > 0 && !platformCounts?.android && !platformCounts?.ios) {
      return 'Web push sertifikası uyumsuz. Firebase Console → Cloud Messaging → Web Push VAPID anahtarını Vercel ile eşleştirin.';
    }
    return 'Firebase kimlik doğrulama hatası. Vercel\'de FIREBASE_SERVICE_ACCOUNT_JSON yenileyin ve redeploy edin.';
  }
  if (text.includes('registration-token-not-registered') || text.includes('invalid-registration-token')) {
    return 'Cihaz tokenı geçersiz veya pasif. Üye uygulamada Bildirimleri yeniden açmalı.';
  }
  return text;
}

// Uygulama içi bildirimi arka planda kaydet — FCM yanıtını geciktirmesin
function queueInAppNotificationSave({
  audience,
  pushText,
  resolved,
  requestId
}) {
  if (!useRelationalState()) return;

  const sqlNotify = getSql();
  if (!sqlNotify) return;

  const targetIds = resolved.targetCustomerIds?.length
    ? resolved.targetCustomerIds
    : (resolved.subscriptions || []).map((row) => Number(row.customerId)).filter((id) => id > 0);

  void insertInAppNotificationsForAudience(sqlNotify, {
    customerIds: targetIds,
    title: pushText.title,
    body: pushText.body,
    audience,
    payload: { source: 'admin_push', requestId }
  }).catch(() => {
    // Realtime bildirim yazımı push yanıtını etkilemesin
  });
}

// Platforma göre FCM mesajı oluştur
function buildPlatformMessage(token, platform, pushText, iconUrl, badgeUrl) {
  const normalized = String(platform || 'web').toLowerCase();
  const base = {
    token,
    notification: {
      title: pushText.title,
      body: pushText.body || ''
    },
    data: {
      title: pushText.title,
      body: pushText.body || '',
      url: SITE_ORIGIN
    }
  };

  if (normalized === 'android') {
    return {
      ...base,
      android: {
        priority: 'high',
        notification: {
          channelId: 'liberte_campaign',
          icon: 'notification_icon',
          color: '#0B2F26'
        }
      }
    };
  }

  if (normalized === 'ios') {
    return {
      ...base,
      apns: {
        headers: {
          'apns-priority': '10'
        },
        payload: {
          aps: {
            alert: {
              title: pushText.title,
              body: pushText.body || ''
            },
            sound: 'default',
            badge: 1
          }
        }
      }
    };
  }

  return {
    ...base,
    webpush: {
      headers: {
        Urgency: 'high',
        TTL: '86400'
      },
      fcmOptions: {
        link: SITE_ORIGIN
      },
      data: {
        title: pushText.title,
        body: pushText.body || '',
        url: SITE_ORIGIN,
        icon: iconUrl,
        badge: badgeUrl
      }
    }
  };
}

// Token → platform eşlemesi
function mapTokenPlatforms(subscriptions = []) {
  const map = new Map();
  subscriptions.forEach((row) => {
    if (!row?.token) return;
    map.set(row.token, String(row.platform || 'web').toLowerCase());
  });
  return map;
}

// Gönderim hatalarını platforma göre grupla
function summarizeFailuresByPlatform(tokens, responses, tokenPlatforms) {
  const summary = { android: [], ios: [], web: [], unknown: [] };
  responses.forEach((row, index) => {
    if (row?.success) return;
    const token = tokens[index];
    const platform = tokenPlatforms.get(token) || 'unknown';
    const code = row?.error?.code || row?.error?.message || 'unknown';
    summary[platform]?.push(code);
  });
  return summary;
}

// Push bildirimi gönder
export async function handleAdminPushSend(req, res) {
  applyCors(req, res, 'POST,OPTIONS');
  const trace = createRequestTrace('admin.push-send');
  const startedAt = Date.now();

  try {
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const adminSession = await requireAdminSession(req, res, { pinRequired: true, light: true });
    if (!adminSession) return;

    const body = readBodySafe(req);
    const audience = String(body.audience || body.targetType || 'all').trim();
    const title = String(body.title || '').trim();
    const message = String(body.body || body.message || 'Yeni kampanya var!').trim();
    const pushText = formatPushNotification(title, message);

    trace.log('start', {
      adminCustomerId: adminSession.customerId,
      audience,
      step: 'parse_body'
    });

    let stateData = null;
    const simpleAudience = audience === 'all' || audience === 'granted_devices';

    if (useRelationalState()) {
      const sqlSubs = await loadPushSubscriptionsFromSql();
      if (simpleAudience) {
        stateData = {
          pushSubscriptions: sqlSubs,
          customers: [],
          loyalty: {},
          history: [],
          checkIns: []
        };
      } else {
        const composed = await composeStateFromRelational();
        stateData = {
          ...composed.data,
          pushSubscriptions: sqlSubs.length ? sqlSubs : (composed.data?.pushSubscriptions || [])
        };
      }
    } else {
      const remote = await loadAppState();
      if (!remote.data) {
        return res.status(404).json(trace.failBody('state', 'NOT_FOUND', 'Veri bulunamadı'));
      }
      stateData = remote.data;
    }

    if (!stateData) {
      return res.status(404).json(trace.failBody('state', 'NOT_FOUND', 'Veri bulunamadı'));
    }

    const preparedState = useRelationalState()
      ? { ...stateData, pushSubscriptions: stateData.pushSubscriptions || [] }
      : await preparePushState(stateData);
    const resolved = resolvePushAudience(preparedState, audience);
    const platformCounts = summarizeTargetPlatforms(resolved.subscriptions);
    if (resolved.disabled) {
      return res.status(400).json({
        ok: false,
        sent: 0,
        failed: 0,
        note: resolved.disabledReason || 'Hedef kitle kullanılamıyor.'
      });
    }

    const clean = [...new Set(resolved.tokens.filter(Boolean))];

    if (!clean.length) {
      queueInAppNotificationSave({
        audience,
        pushText,
        resolved,
        requestId: trace.requestId
      });
      const hadSubscriptions = (preparedState.pushSubscriptions || []).some(
        (row) => row?.token && row.active !== false
      );
      return res.status(200).json({
        ok: false,
        sent: 0,
        failed: 0,
        savedInApp: true,
        audience,
        audienceLabel: resolved.audienceLabel,
        targetUserCount: resolved.targetUserCount,
        deviceCount: 0,
        note: hadSubscriptions
          ? 'Kayıtlı cihaz var ancak hedef kitle filtresine uyan izinli token bulunamadı. Hedefi "Sadece izin vermiş cihazlar" seçip tekrar deneyin.'
          : 'Seçilen hedef kitlede kayıtlı bildirim tokenı yok.'
      });
    }

    const serviceAccount = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    const validationError = validateServiceAccount(serviceAccount);
    const hasFirebaseProjectId = Boolean(serviceAccount?.project_id);
    const hasFirebaseClientEmail = Boolean(serviceAccount?.client_email);
    const hasFirebasePrivateKey = Boolean(serviceAccount?.private_key);
    const privateKeyLooksValid = hasFirebasePrivateKey && isValidPrivateKeyPem(serviceAccount?.private_key);

    trace.log('provider_config', {
      adminCustomerId: adminSession.customerId,
      hasFirebaseProjectId,
      hasFirebaseClientEmail,
      hasFirebasePrivateKey,
      privateKeyLooksValid,
      provider: 'firebase',
      step: 'provider_config'
    });

    if (validationError) {
      return res.status(200).json({
        ok: false,
        savedInApp: true,
        code: 'PUSH_PROVIDER_UNAVAILABLE',
        message: 'Uygulama içi kaydedildi. Push sunucusuna ulaşılamadı.',
        pushErrorStep: 'validate_service_account',
        requestId: trace.requestId,
        sent: 0,
        failed: clean.length,
        note: validationError
      });
    }

    const fb = getAdmin(serviceAccount);
    const iconUrl = `${SITE_ORIGIN}/icon-192.png?v=8`;
    const badgeUrl = `${SITE_ORIGIN}/notification-badge.png`;
    const tokenPlatforms = mapTokenPlatforms(resolved.subscriptions);
    const messages = clean.map((token) => buildPlatformMessage(
      token,
      tokenPlatforms.get(token) || 'web',
      pushText,
      iconUrl,
      badgeUrl
    ));

    const result = await fb.messaging().sendEach(messages);
    const failuresByPlatform = summarizeFailuresByPlatform(clean, result.responses, tokenPlatforms);

    trace.log('send_complete', {
      adminCustomerId: adminSession.customerId,
      audience,
      selectedDeviceCount: clean.length,
      grantedDeviceCount: resolved.subscriptions.filter((row) => row?.token).length,
      sent: result.successCount,
      failed: result.failureCount,
      provider: 'firebase',
      durationMs: Date.now() - startedAt,
      step: 'fcm_send'
    });

    const failures = summarizeFailures(result.responses);
    const invalidTokens = collectFailedPushTokens(clean, result.responses, {
      allowThirdPartyRemoval: result.successCount > 0
    });
    const { subscriptions: cleanedSubscriptions, removed } = pruneInvalidPushTokens(
      preparedState.pushSubscriptions || [],
      invalidTokens
    );

    if (removed > 0) {
      if (useRelationalState()) {
        const sql = getSql();
        if (sql) await deactivatePushTokens(sql, invalidTokens);
      } else {
        await persistPushSubscriptions(preparedState, cleanedSubscriptions);
      }
    }

    const logEntry = {
      id: Date.now(),
      title: pushText.title,
      body: pushText.body,
      audience,
      sentCount: result.successCount,
      createdAt: new Date().toLocaleString('tr-TR'),
      failed: result.failureCount,
      requestId: trace.requestId
    };

    if (useRelationalState()) {
      const sql = getSql();
      if (sql) {
        void insertPushSendLog(sql, logEntry);
      }
    }

    let note = `${result.successCount} cihaza iletildi`;
    if (result.failureCount) note += `, ${result.failureCount} başarısız`;
    if (failures) note += ` (${explainPushFailure(failures, platformCounts)})`;
    if (invalidTokens.length) {
      note += `. ${invalidTokens.length} sorunlu kayıt listeden kaldırıldı — ilgili üye Bildirimleri yeniden açmalı.`;
    } else if (result.successCount > 0) {
      note += '. Görünmüyorsa uygulamayı arka plana alın veya Bildirimleri yeniden açın.';
    }

    queueInAppNotificationSave({
      audience,
      pushText,
      resolved,
      requestId: trace.requestId
    });

    return res.status(200).json({
      ok: result.successCount > 0,
      requestId: trace.requestId,
      sent: result.successCount,
      failed: result.failureCount,
      inactiveTokens: invalidTokens.length,
      invalidRemoved: invalidTokens.length,
      invalidTokens,
      audience,
      audienceLabel: resolved.audienceLabel,
      targetUserCount: resolved.targetUserCount,
      deviceCount: clean.length,
      failuresByPlatform,
      note
    });
  } catch (error) {
    trace.log('error', {
      step: 'unexpected',
      message: error?.message || 'Push gönderilemedi',
      durationMs: Date.now() - startedAt
    });
    return res.status(500).json({
      ok: false,
      savedInApp: true,
      code: 'PUSH_SEND_FAILED',
      message: 'Push gönderilemedi.',
      pushErrorStep: 'unexpected',
      requestId: trace.requestId,
      sent: 0,
      error: error?.message || 'Push gönderilemedi',
      note: `Push hatası: ${error?.message || 'bilinmeyen hata'}`
    });
  }
}
