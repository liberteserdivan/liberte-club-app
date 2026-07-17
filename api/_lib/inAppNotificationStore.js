import { getSql } from './sql.js';
import { isProductionRuntime } from './schemaReady.js';

// Uygulama içi bildirim tablosunu hazırla — production'da DDL atlanır
export async function ensureInAppNotificationTable(sql) {
  if (isProductionRuntime()) return;
  await sql`CREATE TABLE IF NOT EXISTS in_app_notifications (
    id bigint PRIMARY KEY,
    customer_id bigint REFERENCES customers(id) ON DELETE CASCADE,
    title text NOT NULL,
    body text,
    target_type text NOT NULL DEFAULT 'customer',
    created_at timestamptz NOT NULL DEFAULT now(),
    read_at timestamptz,
    payload jsonb,
    is_active boolean NOT NULL DEFAULT true,
    legacy_json jsonb
  )`;
  await sql`ALTER TABLE in_app_notifications ADD COLUMN IF NOT EXISTS target_type text NOT NULL DEFAULT 'customer'`;
  await sql`ALTER TABLE in_app_notifications ADD COLUMN IF NOT EXISTS read_at timestamptz`;
  await sql`ALTER TABLE in_app_notifications ADD COLUMN IF NOT EXISTS payload jsonb`;
  await sql`ALTER TABLE in_app_notifications ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true`;
  await sql`CREATE INDEX IF NOT EXISTS idx_in_app_notifications_customer ON in_app_notifications (customer_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_in_app_notifications_target ON in_app_notifications (target_type)`;
}

// SQL satırını API formatına çevir
function rowToNotification(row) {
  if (!row) return null;
  const legacy = row.legacy_json && typeof row.legacy_json === 'object' ? row.legacy_json : {};
  const payload = row.payload || legacy.payload || null;
  const payloadObj = payload && typeof payload === 'object' ? payload : {};
  // Payload icinden ust seviye gorsel URL (kart acilisinda kolaylik)
  const imageUrl = String(
    payloadObj.imageUrl || payloadObj.image || legacy.imageUrl || ''
  ).trim();
  return {
    id: Number(row.id),
    customerId: row.customer_id != null ? Number(row.customer_id) : null,
    title: row.title || legacy.title || '',
    body: row.body || legacy.body || '',
    targetType: row.target_type || legacy.targetType || 'customer',
    createdAt: row.created_at
      ? new Date(row.created_at).toLocaleString('tr-TR')
      : (legacy.createdAt || new Date().toLocaleString('tr-TR')),
    readAt: row.read_at || null,
    payload,
    imageUrl: imageUrl || null,
    active: row.is_active !== false
  };
}

// Tek bildirim ekle
export async function insertInAppNotification(sql, {
  customerId = null,
  title,
  body = '',
  targetType = 'customer',
  payload = null
}) {
  await ensureInAppNotificationTable(sql);
  const id = Date.now() + Math.floor(Math.random() * 1000);
  await sql`
    INSERT INTO in_app_notifications (
      id, customer_id, title, body, target_type, payload, is_active, legacy_json
    )
    VALUES (
      ${id},
      ${customerId != null ? Number(customerId) : null},
      ${title},
      ${body || null},
      ${targetType},
      ${payload ? JSON.stringify(payload) : null}::jsonb,
      true,
      ${JSON.stringify({ title, body, targetType, customerId })}
    )
  `;
  return rowToNotification({
    id,
    customer_id: customerId,
    title,
    body,
    target_type: targetType,
    created_at: new Date(),
    payload,
    is_active: true
  });
}

// Hedef kitleye toplu uygulama içi bildirim
export async function insertInAppNotificationsForAudience(sql, {
  customerIds = [],
  title,
  body = '',
  audience = 'all',
  payload = null
}) {
  const uniqueIds = [...new Set(customerIds.map((id) => Number(id)).filter((id) => id > 0))];
  const rows = [];

  if (audience === 'all' || !uniqueIds.length) {
    rows.push(await insertInAppNotification(sql, {
      customerId: null,
      title,
      body,
      targetType: 'all',
      payload: { ...payload, audience }
    }));
    return rows;
  }

  for (const customerId of uniqueIds) {
    rows.push(await insertInAppNotification(sql, {
      customerId,
      title,
      body,
      targetType: 'customer',
      payload: { ...payload, audience }
    }));
  }

  return rows;
}

// Müşteri bildirimlerini listele
export async function listInAppNotificationsForCustomer(sql, customerId, limit = 30) {
  await ensureInAppNotificationTable(sql);
  const rows = await sql`
    SELECT *
    FROM in_app_notifications
    WHERE is_active = true
      AND (
        customer_id = ${Number(customerId)}
        OR target_type = 'all'
      )
    ORDER BY created_at DESC
    LIMIT ${Math.min(Math.max(Number(limit) || 30, 1), 100)}
  `;
  return rows.map(rowToNotification).filter(Boolean);
}
