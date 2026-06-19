import admin from 'firebase-admin';
import { parseServiceAccount, validateServiceAccount } from '../serviceAccount.js';
import { formatPushNotification } from '../pushNotificationText.js';
import { applyCors, readBodySafe } from '../http.js';
import { requireAdminSession } from '../auth.js';
import { loadAppState, saveAppState } from '../appState.js';
import { useRelationalState } from '../relationalConfig.js';
import { loadPushSubscriptionsFromSql, deactivatePushTokens, insertPushSendLog } from '../pushStore.js';
import { getSql } from '../sql.js';
import { createRequestTrace } from '../requestTrace.js';
import { resolvePushAudience } from '../../../src/lib/pushAudience.js';
import { sanitizePushSubscriptions } from '../../../src/lib/pushSubscriptionSanitize.js';
import { collectFailedPushTokens, pruneInvalidPushTokens } from '../../../src/lib/pushTokens.js';
import { probeFcmCredentials } from '../fcmProbe.js';

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

  try {
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const adminSession = await requireAdminSession(req, res, { pinRequired: true });
    if (!adminSession) return;

    const body = readBodySafe(req);
    const audience = String(body.audience || body.targetType || 'all').trim();
    const title = String(body.title || '').trim();
    const message = String(body.body || body.message || 'Yeni kampanya var!').trim();
    const pushText = formatPushNotification(title, message);

    const remote = await loadAppState();
    if (!remote.data) {
      return res.status(404).json(trace.failBody('state', 'NOT_FOUND', 'Veri bulunamadı'));
    }

    let stateData = remote.data;
    if (useRelationalState()) {
      const sqlSubs = await loadPushSubscriptionsFromSql();
      if (sqlSubs.length) {
        stateData = { ...stateData, pushSubscriptions: sqlSubs };
      }
    }

    const preparedState = await preparePushState(stateData);
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
      return res.status(200).json({
        ok: true,
        sent: 0,
        failed: 0,
        audience,
        audienceLabel: resolved.audienceLabel,
        targetUserCount: resolved.targetUserCount,
        deviceCount: 0,
        note: 'Seçilen hedef kitlede kayıtlı bildirim tokenı yok.'
      });
    }

    const serviceAccount = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    const validationError = validateServiceAccount(serviceAccount);
    if (validationError) {
      return res.status(200).json({ ok: false, sent: 0, note: validationError });
    }

    const authProbe = await probeFcmCredentials(serviceAccount);
    if (!authProbe.ok) {
      return res.status(200).json({
        ok: false,
        sent: 0,
        failed: clean.length,
        note: `Firebase service account doğrulanamadı: ${authProbe.message}`
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

    const failures = summarizeFailures(result.responses);
    const invalidTokens = collectFailedPushTokens(clean, result.responses, {
      allowThirdPartyRemoval: result.successCount > 0
    });
    const { subscriptions: cleanedSubscriptions, removed } = pruneInvalidPushTokens(
      preparedState.pushSubscriptions || [],
      invalidTokens
    );

    if (removed > 0) {
      await persistPushSubscriptions(preparedState, cleanedSubscriptions);
      if (useRelationalState()) {
        const sql = getSql();
        if (sql) await deactivatePushTokens(sql, invalidTokens);
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
      if (sql) await insertPushSendLog(sql, logEntry);
    }

    let note = `${result.successCount} cihaza iletildi`;
    if (result.failureCount) note += `, ${result.failureCount} başarısız`;
    if (failures) note += ` (${explainPushFailure(failures, platformCounts)})`;
    if (invalidTokens.length) {
      note += `. ${invalidTokens.length} sorunlu kayıt listeden kaldırıldı — ilgili üye Bildirimleri yeniden açmalı.`;
    } else if (result.successCount > 0) {
      note += '. Görünmüyorsa uygulamayı arka plana alın veya Bildirimleri yeniden açın.';
    }

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
    return res.status(500).json({
      ok: false,
      code: 'PUSH_SEND_FAILED',
      message: 'Bildirim gönderilemedi.',
      requestId: trace.requestId,
      sent: 0,
      error: error?.message || 'Push gönderilemedi',
      note: `Push hatası: ${error?.message || 'bilinmeyen hata'}`
    });
  }
}
