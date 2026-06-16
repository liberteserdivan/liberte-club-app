import admin from 'firebase-admin';
import { parseServiceAccount, validateServiceAccount } from '../serviceAccount.js';
import { formatPushNotification } from '../pushNotificationText.js';
import { applyCors, readBodySafe } from '../http.js';
import { requireAdminSession } from '../auth.js';
import { loadAppState } from '../appState.js';
import { resolvePushAudience } from '../../../src/lib/pushAudience.js';

const SITE_ORIGIN = 'https://app.liberte.cafe';

const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument'
]);

// Firebase Admin SDK başlat
function getAdmin(serviceAccount) {
  if (admin.apps.length) return admin;
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  return admin;
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

// Gönderim sonrası silinmesi gereken tokenları bul
function collectInvalidTokens(tokens, responses) {
  const invalid = [];
  responses.forEach((row, index) => {
    if (row.success) return;
    const code = row.error?.code || '';
    if (INVALID_TOKEN_CODES.has(code) && tokens[index]) {
      invalid.push(tokens[index]);
    }
  });
  return [...new Set(invalid)];
}

// Push bildirimi gönder
export async function handleAdminPushSend(req, res) {
  applyCors(req, res, 'POST,OPTIONS');

  try {
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const adminSession = await requireAdminSession(req, res, { pinRequired: true });
    if (!adminSession) return;

    const body = readBodySafe(req);
    const audience = String(body.audience || 'all').trim();
    const title = String(body.title || '').trim();
    const message = String(body.body || body.message || 'Yeni kampanya var!').trim();
    const pushText = formatPushNotification(title, message);

    const remote = await loadAppState();
    if (!remote.data) {
      return res.status(404).json({ ok: false, error: 'Veri bulunamadı', sent: 0, failed: 0 });
    }

    const resolved = resolvePushAudience(remote.data, audience);
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

    const fb = getAdmin(serviceAccount);
    const iconUrl = `${SITE_ORIGIN}/icon-192.png?v=8`;
    const badgeUrl = `${SITE_ORIGIN}/notification-badge.png`;

    const result = await fb.messaging().sendEachForMulticast({
      tokens: clean,
      notification: {
        title: pushText.title,
        body: pushText.body || ''
      },
      data: {
        title: pushText.title,
        body: pushText.body || '',
        url: SITE_ORIGIN
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'liberte_campaign',
          icon: 'notification_icon',
          color: '#0B2F26'
        }
      },
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
      },
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
    });

    const failures = summarizeFailures(result.responses);
    const invalidTokens = collectInvalidTokens(clean, result.responses);

    let note = `${result.successCount} cihaza iletildi`;
    if (result.failureCount) note += `, ${result.failureCount} başarısız`;
    if (failures) note += ` (${failures})`;
    if (invalidTokens.length) {
      note += `. ${invalidTokens.length} geçersiz kayıt listeden kaldırıldı — ilgili üye Bildirimleri yeniden açmalı.`;
    } else if (result.successCount > 0) {
      note += '. Görünmüyorsa uygulamayı arka plana alın veya Bildirimleri yeniden açın.';
    }

    return res.status(200).json({
      ok: result.successCount > 0,
      sent: result.successCount,
      failed: result.failureCount,
      invalidTokens,
      audience,
      audienceLabel: resolved.audienceLabel,
      targetUserCount: resolved.targetUserCount,
      deviceCount: clean.length,
      note
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      sent: 0,
      error: error?.message || 'Push gönderilemedi',
      note: `Push hatası: ${error?.message || 'bilinmeyen hata'}`
    });
  }
}
