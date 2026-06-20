import { getSql } from './sql.js';
import { isProductionRuntime } from './schemaReady.js';

// push_subscriptions tablosunu hazırla — production'da bootstrap SQL yeterli
export async function ensurePushTables(sql) {
  if (isProductionRuntime()) return;
  await sql`CREATE TABLE IF NOT EXISTS push_subscriptions (
    id bigint PRIMARY KEY,
    customer_id bigint REFERENCES customers(id) ON DELETE CASCADE,
    token text,
    channel text,
    platform text,
    device_id text,
    permission_status text NOT NULL DEFAULT 'unknown',
    app_version text,
    build_number text,
    active boolean NOT NULL DEFAULT true,
    created_at text,
    last_seen_at text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    revoked_at timestamptz,
    legacy_json jsonb
  )`;
  await sql`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS device_id text`;
  await sql`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS permission_status text NOT NULL DEFAULT 'unknown'`;
  await sql`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS app_version text`;
  await sql`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS build_number text`;
  await sql`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS last_seen_at text`;
  await sql`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()`;
  await sql`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS revoked_at timestamptz`;
  await sql`CREATE INDEX IF NOT EXISTS idx_push_subscriptions_customer ON push_subscriptions (customer_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_push_subscriptions_token ON push_subscriptions (token)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_push_subscriptions_device ON push_subscriptions (device_id)`;
}

// SQL satırını API formatına çevir
function rowToSubscription(row) {
  if (!row) return null;
  const legacy = row.legacy_json && typeof row.legacy_json === 'object' ? row.legacy_json : {};
  return {
    id: Number(row.id),
    customerId: Number(row.customer_id),
    userId: Number(row.customer_id),
    token: row.token || legacy.token || '',
    channel: row.channel || legacy.channel || 'web',
    platform: row.platform || legacy.platform || 'web',
    deviceId: row.device_id || legacy.deviceId || null,
    permissionStatus: row.permission_status || legacy.permissionStatus || 'unknown',
    appVersion: row.app_version || legacy.appVersion || null,
    buildNumber: row.build_number || legacy.buildNumber || null,
    active: row.active !== false && !row.revoked_at,
    createdAt: row.created_at || legacy.createdAt || null,
    lastSeenAt: row.last_seen_at || legacy.lastSeenAt || null,
    updatedAt: row.updated_at || legacy.updatedAt || null,
    name: legacy.name || null,
    phone: legacy.phone || null
  };
}

// Aktif abonelikleri listele
export async function loadPushSubscriptionsFromSql(externalSql = null) {
  const sql = externalSql || getSql();
  if (!sql) return [];

  await ensurePushTables(sql);
  const rows = await sql`
    SELECT *
    FROM push_subscriptions
    WHERE active = true AND revoked_at IS NULL
    ORDER BY updated_at DESC
  `;
  return rows.map(rowToSubscription).filter(Boolean);
}

// Cihaz token kaydı — oturum doğrulaması handler'da yapılır
export async function upsertPushDevice(sql, {
  customerId,
  token = null,
  channel = 'web',
  platform = 'web',
  deviceId = null,
  permissionStatus = 'unknown',
  appVersion = null,
  buildNumber = null,
  customerMeta = {}
}) {
  await ensurePushTables(sql);
  const nowText = new Date().toLocaleString('tr-TR');
  const normalizedPermission = String(permissionStatus || 'unknown').toLowerCase();
  const isGranted = normalizedPermission === 'granted' && Boolean(token);
  const recordId = Date.now();

  const legacy = {
    customerId: Number(customerId),
    userId: Number(customerId),
    token: token || '',
    channel,
    platform,
    deviceId,
    permissionStatus: normalizedPermission,
    appVersion,
    buildNumber,
    name: customerMeta.name || null,
    phone: customerMeta.phone || null,
    active: isGranted,
    createdAt: nowText,
    lastSeenAt: nowText,
    updatedAt: nowText
  };

  if (deviceId) {
    const existing = await sql`
      SELECT id FROM push_subscriptions
      WHERE customer_id = ${Number(customerId)} AND device_id = ${deviceId}
      LIMIT 1
    `;
    const targetId = existing[0]?.id ? Number(existing[0].id) : recordId;

    await sql`
      INSERT INTO push_subscriptions (
        id, customer_id, token, channel, platform, device_id, permission_status,
        app_version, build_number, active, created_at, last_seen_at, updated_at, revoked_at, legacy_json
      )
      VALUES (
        ${targetId},
        ${Number(customerId)},
        ${token || null},
        ${channel},
        ${platform},
        ${deviceId},
        ${normalizedPermission},
        ${appVersion},
        ${buildNumber},
        ${isGranted},
        ${nowText},
        ${nowText},
        now(),
        NULL,
        ${JSON.stringify(legacy)}
      )
      ON CONFLICT (id) DO UPDATE SET
        token = EXCLUDED.token,
        channel = EXCLUDED.channel,
        platform = EXCLUDED.platform,
        device_id = EXCLUDED.device_id,
        permission_status = EXCLUDED.permission_status,
        app_version = EXCLUDED.app_version,
        build_number = EXCLUDED.build_number,
        active = EXCLUDED.active,
        last_seen_at = EXCLUDED.last_seen_at,
        updated_at = now(),
        revoked_at = NULL,
        legacy_json = EXCLUDED.legacy_json
    `;

    return rowToSubscription({
      id: targetId,
      customer_id: customerId,
      token,
      channel,
      platform,
      device_id: deviceId,
      permission_status: normalizedPermission,
      app_version: appVersion,
      build_number: buildNumber,
      active: isGranted,
      created_at: nowText,
      last_seen_at: nowText,
      legacy_json: legacy
    });
  }

  if (token) {
    const existing = await sql`
      SELECT id FROM push_subscriptions WHERE token = ${token} LIMIT 1
    `;
    const targetId = existing[0]?.id ? Number(existing[0].id) : recordId;

    await sql`
      INSERT INTO push_subscriptions (
        id, customer_id, token, channel, platform, device_id, permission_status,
        app_version, build_number, active, created_at, last_seen_at, updated_at, revoked_at, legacy_json
      )
      VALUES (
        ${targetId},
        ${Number(customerId)},
        ${token},
        ${channel},
        ${platform},
        ${deviceId},
        ${normalizedPermission},
        ${appVersion},
        ${buildNumber},
        ${isGranted},
        ${nowText},
        ${nowText},
        now(),
        NULL,
        ${JSON.stringify(legacy)}
      )
      ON CONFLICT (id) DO UPDATE SET
        customer_id = EXCLUDED.customer_id,
        token = EXCLUDED.token,
        channel = EXCLUDED.channel,
        platform = EXCLUDED.platform,
        device_id = EXCLUDED.device_id,
        permission_status = EXCLUDED.permission_status,
        app_version = EXCLUDED.app_version,
        build_number = EXCLUDED.build_number,
        active = EXCLUDED.active,
        last_seen_at = EXCLUDED.last_seen_at,
        updated_at = now(),
        revoked_at = NULL,
        legacy_json = EXCLUDED.legacy_json
    `;

    return rowToSubscription({
      id: targetId,
      customer_id: customerId,
      token,
      channel,
      platform,
      device_id: deviceId,
      permission_status: normalizedPermission,
      app_version: appVersion,
      build_number: buildNumber,
      active: isGranted,
      created_at: nowText,
      last_seen_at: nowText,
      legacy_json: legacy
    });
  }

  return null;
}

// Geçersiz tokenları pasifleştir
export async function deactivatePushTokens(sql, tokens = []) {
  if (!sql || !tokens.length) return 0;
  await ensurePushTables(sql);
  const rows = await sql`
    UPDATE push_subscriptions
    SET active = false, revoked_at = now(), updated_at = now()
    WHERE token = ANY(${tokens}) AND active = true
    RETURNING id
  `;
  return rows.length;
}

// Tüm aktif push kayıtlarını pasifleştir
export async function deactivateAllPushSubscriptions(sql) {
  if (!sql) return 0;
  await ensurePushTables(sql);
  const rows = await sql`
    UPDATE push_subscriptions
    SET active = false, revoked_at = now(), updated_at = now()
    WHERE active = true AND revoked_at IS NULL
    RETURNING id
  `;
  return rows.length;
}

// Gönderim logu yaz — production'da tablo bootstrap ile hazır
export async function insertPushSendLog(sql, entry) {
  if (!isProductionRuntime()) {
    await sql`CREATE TABLE IF NOT EXISTS push_send_log (
      id bigint PRIMARY KEY,
      title text,
      body text,
      audience text,
      sent_count int,
      created_at text,
      legacy_json jsonb
    )`;
  }
  await sql`
    INSERT INTO push_send_log (id, title, body, audience, sent_count, created_at, legacy_json)
    VALUES (
      ${Number(entry.id || Date.now())},
      ${entry.title || null},
      ${entry.body || null},
      ${entry.audience || null},
      ${entry.sentCount != null ? Number(entry.sentCount) : null},
      ${entry.createdAt || new Date().toLocaleString('tr-TR')},
      ${JSON.stringify(entry)}
    )
    ON CONFLICT (id) DO NOTHING
  `;
}
