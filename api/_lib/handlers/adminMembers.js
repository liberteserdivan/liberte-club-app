import { applyCors, sendApiError } from '../http.js';
import { requireAdminSession } from '../auth.js';
import { listAllCustomers } from '../customersStore.js';
import { loadLoyaltyMapLightFromSql } from '../loyaltyStore.js';
import { getSql, primeSqlConnection } from '../sql.js';
import { runSqlAdminMembersRead } from '../runSql.js';
import { classifyLoginDbError } from '../dbTransient.js';

// Güvenli zamanlama özeti — PII/token içermez
function buildTimings({ t0, authMs, queryMs, totalMs, dbErrorType = null, loyaltyMs = null }) {
  return {
    auth_ms: authMs,
    members_query_ms: queryMs,
    ...(loyaltyMs != null ? { loyalty_query_ms: loyaltyMs } : {}),
    total_ms: totalMs ?? (Date.now() - t0),
    ...(dbErrorType ? { db_error_type: dbErrorType } : {})
  };
}

// Yönetici üye listesi — customers tablosundan doğrudan okuma.
export async function handleAdminMembers(req, res) {
  const t0 = Date.now();
  applyCors(req, res, 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const tAuthStart = Date.now();
  const admin = await requireAdminSession(req, res, { light: true, members: true });
  const authMs = Date.now() - tAuthStart;
  if (!admin) return;

  await primeSqlConnection(2000);

  if (!getSql()) {
    return sendApiError(res, {
      status: 503,
      code: 'ADMIN_MEMBERS_TEMPORARILY_UNAVAILABLE',
      message: 'Üye listesi şu an alınamıyor. Lütfen tekrar deneyin.',
      step: 'admin_members_no_sql',
      requestId: req.requestId || null,
      timings: buildTimings({ t0, authMs, queryMs: 0 })
    });
  }

  const tQueryStart = Date.now();
  let customers = [];
  try {
    customers = await runSqlAdminMembersRead(() => listAllCustomers(getSql()));
  } catch (error) {
    const queryMs = Date.now() - tQueryStart;
    const dbErrorType = classifyLoginDbError(error);
    return sendApiError(res, {
      status: 500,
      code: 'ADMIN_MEMBERS_FAILED',
      message: 'Üye listesi alınamadı',
      step: 'admin_members_query_failed',
      requestId: req.requestId || null,
      timings: buildTimings({ t0, authMs, queryMs, dbErrorType: dbErrorType || null }),
      error
    });
  }

  const queryMs = Date.now() - tQueryStart;
  const tLoyaltyStart = Date.now();
  let loyalty = {};
  let loyaltyDegraded = false;

  try {
    loyalty = await runSqlAdminMembersRead(() => loadLoyaltyMapLightFromSql(getSql()));
  } catch (error) {
    loyaltyDegraded = true;
    console.warn('[admin.members] loyalty map skipped:', error?.message || error);
  }

  const loyaltyMs = Date.now() - tLoyaltyStart;

  return res.status(200).json({
    ok: true,
    customers,
    loyalty,
    count: customers.length,
    loyaltyDegraded,
    requestId: req.requestId || null,
    timings: buildTimings({ t0, authMs, queryMs, loyaltyMs })
  });
}
