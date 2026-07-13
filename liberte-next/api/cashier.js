import { getSql } from './_lib/sql.js';
import { applyCors, readJsonBody, sendJson } from './_lib/http.js';
import { resolveSession } from './_lib/session.js';
import { verifyCustomerQrToken } from './_lib/qrToken.js';
import {
  LP_CATEGORIES,
  LP_GAIN,
  LP_COSTS,
  applyLpEarn,
  applyLpRedeem,
  claimQrNonce,
  insertLoyaltyEvent,
  loadLoyaltyForCustomer,
  writeLoyaltyCard
} from './_lib/loyalty.js';

// Admin oturum zorunlu — role admin veya customers.is_admin
async function requireAdminSession(sql, req, res) {
  const session = await resolveSession(sql, req);
  if (!session) {
    sendJson(res, 401, { ok: false, error: 'Oturum gerekli' });
    return null;
  }
  if (session.isAdmin || session.role === 'admin') {
    return session;
  }
  const rows = await sql`
    SELECT is_admin FROM customers WHERE id = ${Number(session.customerId)} LIMIT 1
  `;
  if (!rows[0]?.is_admin) {
    sendJson(res, 403, { ok: false, error: 'Yönetici yetkisi gerekli' });
    return null;
  }
  return { ...session, isAdmin: true };
}

async function loadCustomerSummary(sql, customerId) {
  const rows = await sql`
    SELECT id, name, phone, normalized_phone, email, is_admin
    FROM customers
    WHERE id = ${Number(customerId)}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  const loyalty = await loadLoyaltyForCustomer(sql, customerId);
  return {
    customer: {
      id: Number(row.id),
      name: row.name || '',
      phone: row.phone || row.normalized_phone || '',
      email: row.email || null
    },
    loyalty
  };
}

async function handleVerify(req, res, sql) {
  const body = readJsonBody(req);
  const verified = verifyCustomerQrToken(body.token || body.payload || '', { allowExpired: true });
  if (!verified.ok) {
    return sendJson(res, 400, { ok: false, error: verified.error, expired: Boolean(verified.expired) });
  }
  const summary = await loadCustomerSummary(sql, verified.customerId);
  if (!summary) {
    return sendJson(res, 404, { ok: false, error: 'Müşteri bulunamadı' });
  }
  return sendJson(res, 200, {
    ok: true,
    customerId: verified.customerId,
    expired: Boolean(verified.expired),
    expiresAt: verified.expiresAt,
    ...summary
  });
}

async function handleLp(req, res, sql) {
  const body = readJsonBody(req);
  const verified = verifyCustomerQrToken(body.token || body.payload || '', { allowExpired: false });
  if (!verified.ok) {
    return sendJson(res, 400, {
      ok: false,
      error: verified.error,
      expired: Boolean(verified.expired)
    });
  }

  const action = String(body.action || '').trim().toLowerCase();
  const category = String(body.category || '').trim().toLowerCase();
  const count = Math.trunc(Number(body.count || 1));

  if (action !== 'earn' && action !== 'redeem') {
    return sendJson(res, 400, { ok: false, error: 'action earn|redeem olmalı' });
  }
  if (!LP_CATEGORIES.includes(category)) {
    return sendJson(res, 400, { ok: false, error: 'Geçersiz kategori' });
  }
  if (!Number.isFinite(count) || count < 1 || count > 10) {
    return sendJson(res, 400, { ok: false, error: 'count 1-10 olmalı' });
  }

  const nonceAction = `${action}:${category}:${count}`;
  const claim = await claimQrNonce(sql, {
    nonce: verified.nonce,
    action: nonceAction,
    customerId: verified.customerId
  });
  if (!claim.firstUse) {
    return sendJson(res, 409, { ok: false, error: 'Bu QR zaten kullanıldı' });
  }

  const current = await loadLoyaltyForCustomer(sql, verified.customerId);
  const result = action === 'earn'
    ? applyLpEarn(current, category, count)
    : applyLpRedeem(current, category, count);

  if (!result.ok) {
    return sendJson(res, 400, { ok: false, error: result.error });
  }

  await writeLoyaltyCard(sql, verified.customerId, result.card);
  await insertLoyaltyEvent(sql, {
    customerId: verified.customerId,
    eventType: action === 'earn' ? `earn_${category}` : `redeem_${category}`,
    category,
    delta: result.delta,
    note: 'kasiyer-next'
  });

  const summary = await loadCustomerSummary(sql, verified.customerId);
  return sendJson(res, 200, {
    ok: true,
    action,
    category,
    count,
    delta: result.delta,
    unitGain: LP_GAIN[category],
    unitCost: LP_COSTS[category],
    ...summary
  });
}

// Liberte Next kasiyer — Guardian yok
export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'POST gerekli' });
  }

  const sql = getSql();
  if (!sql) {
    return sendJson(res, 503, { ok: false, error: 'Veritabanı yapılandırılmadı' });
  }

  try {
    const admin = await requireAdminSession(sql, req, res);
    if (!admin) return;

    const action = String(req.query?.action || '').trim().toLowerCase();
    if (action === 'verify') return handleVerify(req, res, sql);
    if (action === 'lp') return handleLp(req, res, sql);

    return sendJson(res, 404, { ok: false, error: 'Bilinmeyen action' });
  } catch (error) {
    console.error('[n-cashier]', error?.message || error);
    return sendJson(res, 500, { ok: false, error: 'Sunucu hatası' });
  }
}
