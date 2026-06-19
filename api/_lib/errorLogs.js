import { getSql } from './appState.js';
import { ensureSchemaReady } from './schemaReady.js';

// Log saklama süresi — 7 gün
const LOG_RETENTION_DAYS = 7;
const MAX_DETAIL_LENGTH = 4000;
const MAX_MESSAGE_LENGTH = 500;

// Log tablosunu hazırla
async function ensureErrorLogTable(sql) {
  await ensureSchemaReady(sql);
}

// Eski logları temizle — son 7 gün dışındakileri sil
async function pruneOldLogs(sql) {
  await sql`DELETE FROM app_error_logs
    WHERE created_at < now() - interval '7 days'`;
}

// Detay alanını güvenli boyuta indir
function sanitizeDetail(detail) {
  if (detail == null) return null;
  try {
    const text = JSON.stringify(detail);
    if (text.length <= MAX_DETAIL_LENGTH) return detail;
    return { truncated: true, preview: text.slice(0, MAX_DETAIL_LENGTH) };
  } catch {
    return { truncated: true, preview: String(detail).slice(0, 500) };
  }
}

// Yeni hata kaydı ekle
export async function insertErrorLog({
  level = 'error',
  source = 'unknown',
  message = '',
  code = '',
  detail = null,
  customerId = null,
  platform = ''
}) {
  const sql = getSql();
  if (!sql) return null;

  await ensureErrorLogTable(sql);

  const safeMessage = String(message || 'Bilinmeyen hata').slice(0, MAX_MESSAGE_LENGTH);
  const safeLevel = ['error', 'warn', 'info'].includes(level) ? level : 'error';
  const safeSource = String(source || 'unknown').slice(0, 120);
  const safeCode = code ? String(code).slice(0, 80) : null;
  const safePlatform = platform ? String(platform).slice(0, 32) : null;
  const safeDetail = sanitizeDetail(detail);

  const rows = await sql`
    INSERT INTO app_error_logs (level, source, message, code, detail, customer_id, platform)
    VALUES (
      ${safeLevel},
      ${safeSource},
      ${safeMessage},
      ${safeCode},
      ${safeDetail ? JSON.stringify(safeDetail) : null},
      ${customerId ? Number(customerId) : null},
      ${safePlatform}
    )
    RETURNING id, created_at
  `;

  await pruneOldLogs(sql);
  return rows[0] || null;
}

// Yönetici listesi — en yeni kayıtlar önce
export async function listErrorLogs(limit = 200) {
  const sql = getSql();
  if (!sql) return [];

  await ensureErrorLogTable(sql);
  await pruneOldLogs(sql);

  const rows = await sql`
    SELECT id, level, source, message, code, detail, customer_id, platform, created_at
    FROM app_error_logs
    ORDER BY created_at DESC
    LIMIT ${Math.min(Math.max(Number(limit) || 200, 1), 500)}
  `;

  return rows.map((row) => ({
    id: Number(row.id),
    level: row.level,
    source: row.source,
    message: row.message,
    code: row.code || '',
    detail: row.detail || null,
    customerId: row.customer_id ? Number(row.customer_id) : null,
    platform: row.platform || '',
    createdAt: row.created_at
  }));
}

// Tüm logları sil — yönetici isteği
export async function clearAllErrorLogs() {
  const sql = getSql();
  if (!sql) return 0;

  await ensureErrorLogTable(sql);
  const rows = await sql`DELETE FROM app_error_logs RETURNING id`;
  return rows.length;
}

export { LOG_RETENTION_DAYS };
