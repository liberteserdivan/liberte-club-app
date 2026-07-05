import { applyCors, publicErrorMessage } from '../http.js';
import { requireAdminSession } from '../auth.js';
import { listAllCustomers } from '../customersStore.js';
import { loadLoyaltyMapFromSql } from '../loyaltyStore.js';
import { getSql } from '../sql.js';
import { runSqlReadFast } from '../runSql.js';
import { classifyLoginDbError, isTransientDbError } from '../dbTransient.js';

// Güvenli zamanlama özeti — PII/token içermez
function buildTimings({ t0, authMs, queryMs, totalMs, dbErrorType = null, queryTimeoutMs = null }) {
  return {
    auth_ms: authMs,
    members_query_ms: queryMs,
    total_ms: totalMs ?? (Date.now() - t0),
    ...(dbErrorType ? { db_error_type: dbErrorType } : {}),
    ...(queryTimeoutMs != null ? { query_timeout_ms: queryTimeoutMs } : {})
  };
}

// Yönetici üye listesi — customers tablosundan doğrudan okuma.
export async function handleAdminMembers(req, res) {
  const t0 = Date.now();
  applyCors(req, res, 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const tAuthStart = Date.now();
  const admin = await requireAdminSession(req, res, { pinRequired: true, light: true });
  const authMs = Date.now() - tAuthStart;
  if (!admin) return;

  if (!getSql()) {
    return res.status(503).json({
      ok: false,
      code: 'ADMIN_MEMBERS_TEMPORARILY_UNAVAILABLE',
      error: 'Üye listesi şu an alınamıyor. Lütfen tekrar deneyin.',
      step: 'admin_members_no_sql',
      requestId: req.requestId || null,
      timings: buildTimings({ t0, authMs, queryMs: 0 })
    });
  }

  const tQueryStart = Date.now();
  try {
    const customers = await runSqlReadFast(() => listAllCustomers(getSql()));
    const loyalty = await runSqlReadFast(() => loadLoyaltyMapFromSql(getSql()));
    const queryMs = Date.now() - tQueryStart;

    return res.status(200).json({
      ok: true,
      customers,
      loyalty,
      count: customers.length,
      requestId: req.requestId || null,
      timings: buildTimings({ t0, authMs, queryMs })
    });
  } catch (error) {
    const queryMs = Date.now() - tQueryStart;
    const dbErrorType = classifyLoginDbError(error);
    const timings = buildTimings({
      t0,
      authMs,
      queryMs,
      dbErrorType: dbErrorType || null
    });

    if (isTransientDbError(error)) {
      return res.status(503).json({
        ok: false,
        code: 'ADMIN_MEMBERS_TEMPORARILY_UNAVAILABLE',
        error: 'Üye listesi şu an alınamıyor. Lütfen tekrar deneyin.',
        step: 'admin_members_transient',
        requestId: req.requestId || null,
        timings
      });
    }

    return res.status(500).json({
      ok: false,
      code: 'ADMIN_MEMBERS_FAILED',
      error: publicErrorMessage(error, 'Üye listesi alınamadı'),
      step: 'admin_members_failed',
      requestId: req.requestId || null,
      timings
    });
  }
}
