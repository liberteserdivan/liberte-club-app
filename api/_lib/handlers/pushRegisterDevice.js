import { getSql } from '../appState.js';
import { applyCors, readBodySafe } from '../http.js';
import { requireSession, toCustomerSnapshot } from '../auth.js';
import { createRequestTrace } from '../requestTrace.js';
import { upsertPushDevice } from '../pushStore.js';
import { bumpAppStateRevision } from '../relationalState.js';

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
    const requestedCustomerId = Number(body.customerId || body.customer_id || 0);
    const sessionCustomerId = Number(session.customerId);

    if (!requestedCustomerId || requestedCustomerId !== sessionCustomerId) {
      return res.status(403).json(trace.failBody(
        'customer_mismatch',
        'FORBIDDEN',
        'Yalnızca kendi cihazını kaydedebilirsin.'
      ));
    }

    const permissionStatus = normalizePermissionStatus(body.permissionStatus || body.permission_status);
    const token = String(body.token || '').trim() || null;
    const platform = String(body.platform || 'web').trim();
    const channel = platform === 'web' ? 'web' : 'native';
    const deviceId = String(body.deviceId || body.device_id || '').trim() || null;
    const appVersion = String(body.appVersion || body.app_version || '').trim() || null;
    const buildNumber = String(body.buildNumber || body.build_number || '').trim() || null;

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
