import { applyCors, publicErrorMessage, readBodySafe } from './lib/http.js';
import { getSession, requireAdminSession } from './lib/auth.js';
import { logServerError } from './lib/logServerError.js';
import {
  clearAllErrorLogs,
  insertErrorLog,
  listErrorLogs,
  LOG_RETENTION_DAYS
} from './lib/errorLogs.js';

// İstemci ve sunucu hata logları (/api/logs Vercel'de 404 verdiği için ayrı yol)
export default async function handler(req, res) {
  applyCors(req, res, 'GET,POST,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') return await handleList(req, res);
    if (req.method === 'POST') return await handleCreate(req, res);
    if (req.method === 'DELETE') return await handleClear(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    await logServerError({ source: 'api.error-logs', error });
    return res.status(500).json({ error: publicErrorMessage(error, 'Log işlemi başarısız') });
  }
}

// Yönetici — log listesi
async function handleList(req, res) {
  const session = await requireAdminSession(req, res, { pinRequired: true });
  if (!session) return;

  const limit = Number(req.query?.limit || 200);
  const logs = await listErrorLogs(limit);

  return res.status(200).json({
    ok: true,
    retentionDays: LOG_RETENTION_DAYS,
    logs
  });
}

// İstemci — hata kaydı (oturum varsa customer_id eklenir)
async function handleCreate(req, res) {
  const body = readBodySafe(req);
  if (!body.message && !body.userMessage) {
    return res.status(400).json({ error: 'message zorunlu' });
  }

  const session = await getSession(req);
  const row = await insertErrorLog({
    level: body.level,
    source: body.source,
    message: body.userMessage || body.message,
    code: body.code,
    detail: body.detail,
    customerId: session?.customerId || body.customerId || null,
    platform: body.platform
  });

  return res.status(200).json({ ok: true, id: row?.id || null });
}

// Yönetici — tüm logları sil
async function handleClear(req, res) {
  const session = await requireAdminSession(req, res, { pinRequired: true });
  if (!session) return;

  const removed = await clearAllErrorLogs();
  return res.status(200).json({ ok: true, removed });
}
