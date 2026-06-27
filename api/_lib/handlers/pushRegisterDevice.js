import { getSql } from '../appState.js';
import { applyCors, readBodySafe } from '../http.js';
import { requireSession, toCustomerSnapshot } from '../auth.js';
import { createRequestTrace } from '../requestTrace.js';
import { upsertPushDevice } from '../pushStore.js';
import { bumpAppStateRevision } from '../relationalState.js';
import { clampString, oneOfOrDefault, isBodyTooLarge } from '../validateInput.js';

// Cihaz/platform için izinli enum değerleri
const PUSH_PLATFORMS = ['web', 'ios', 'android'];
// FCM/web push tokenları en fazla birkaç yüz karakter — üst sınır koruması
const MAX_PUSH_TOKEN_LEN = 4096;

// İzin durumu normalize et
function normalizePermissionStatus(value) {
  const status = String(value || 'unknown').trim().toLowerCase();
  if (['granted', 'denied', 'prompt', 'error', 'default'].includes(status)) {
    return status === 'default' ? 'prompt' : status;
  }
  return 'unknown';
}

// Cihaz push token kaydı — session zorunlu
export async function handlePushRegisterDevice(req, res) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const trace = createRequestTrace('push.register-device');

  try {
    const session = await requireSession(req, res);
    if (!session) return;

    const body = readBodySafe(req);

    // Gövde boyutu sınırı — şişirilmiş payload reddedilir
    if (isBodyTooLarge(body)) {
      return res.status(413).json(trace.failBody('too_large', 'PAYLOAD_TOO_LARGE', 'İstek gövdesi çok büyük'));
    }

    const requestedCustomerId = Number(body.customerId || body.customer_id || 0);
    const sessionCustomerId = Number(session.customerId);

    if (!requestedCustomerId || requestedCustomerId !== sessionCustomerId) {
      return res.status(403).json(trace.failBody(
        'customer_mismatch',
        'FORBIDDEN',
        'Yalnızca kendi cihazını kaydedebilirsin.'
      ));
    }

    // String uzunluğu + enum doğrulaması
    const permissionStatus = normalizePermissionStatus(body.permissionStatus || body.permission_status);
    const rawToken = clampString(body.token, MAX_PUSH_TOKEN_LEN).trim();
    const token = rawToken || null;
    const platform = oneOfOrDefault(body.platform, PUSH_PLATFORMS, 'web');
    const channel = platform === 'web' ? 'web' : 'native';
    const deviceId = clampString(body.deviceId || body.device_id, 200).trim() || null;
    const appVersion = clampString(body.appVersion || body.app_version, 40).trim() || null;
    const buildNumber = clampString(body.buildNumber || body.build_number, 40).trim() || null;

    trace.log('register', {
      customerId: sessionCustomerId,
      platform,
      permissionStatus,
      hasToken: Boolean(token),
      deviceId: deviceId ? 'set' : 'missing'
    });

    const sql = getSql();
    if (!sql) {
      return res.status(500).json(trace.failBody('database', 'DATABASE_URL', 'Veritabanı yapılandırması eksik'));
    }

    const customer = session.customer || {};
    const row = await upsertPushDevice(sql, {
      customerId: sessionCustomerId,
      token,
      channel,
      platform,
      deviceId,
      permissionStatus,
      appVersion,
      buildNumber,
      customerMeta: {
        name: customer.name,
        phone: customer.phone
      }
    });

    await bumpAppStateRevision(sql);

    return res.status(200).json({
      ok: true,
      requestId: trace.requestId,
      registered: Boolean(row),
      permissionStatus,
      customer: toCustomerSnapshot(customer)
    });
  } catch (error) {
    console.error('[push.register-device]', trace.requestId, error?.message || error);
    return res.status(500).json(trace.failBody(
      'unexpected',
      'PUSH_REGISTER_FAILED',
      error?.message || 'Cihaz kaydı tamamlanamadı'
    ));
  }
}
