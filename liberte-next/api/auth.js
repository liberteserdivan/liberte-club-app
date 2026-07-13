import { getSql } from './_lib/sql.js';
import { applyCors, readJsonBody, sendJson } from './_lib/http.js';
import { cleanPhone, phoneLookupVariants } from './_lib/phone.js';
import { inList } from './_lib/sqlIn.js';
import { verifyCustomerPin, isValidPinFormat } from './_lib/pin.js';
import { createSession, destroySession, resolveSession, readAuthToken } from './_lib/session.js';
import { loadLoyaltyForCustomer } from './_lib/loyalty.js';

// Müşteri özeti
function toCustomerSnapshot(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    name: row.name || '',
    phone: row.phone || row.normalized_phone || '',
    email: row.email || null,
    isAdmin: Boolean(row.is_admin)
  };
}

// Telefon ile müşteri bul
async function findCustomerByPhone(sql, phone) {
  const variants = phoneLookupVariants(phone);
  if (!variants.length) return null;
  const rows = await sql`
    SELECT id, name, phone, normalized_phone, email, is_admin
    FROM customers
    WHERE normalized_phone IN ${inList(sql, variants)}
       OR phone IN ${inList(sql, variants)}
    ORDER BY id ASC
    LIMIT 1
  `;
  return rows[0] || null;
}

// Id ile müşteri
async function findCustomerById(sql, customerId) {
  const rows = await sql`
    SELECT id, name, phone, normalized_phone, email, is_admin
    FROM customers
    WHERE id = ${Number(customerId)}
    LIMIT 1
  `;
  return rows[0] || null;
}

// Oturum + müşteri + loyalty paketle
async function buildMePayload(sql, session) {
  const row = await findCustomerById(sql, session.customerId);
  if (!row) return null;
  const loyalty = await loadLoyaltyForCustomer(sql, session.customerId);
  const isAdmin = session.isAdmin || Boolean(row.is_admin);
  return {
    ok: true,
    customerId: Number(row.id),
    customer: toCustomerSnapshot(row),
    loyalty,
    isAdmin,
    role: isAdmin ? 'admin' : (session.role || 'user')
  };
}

async function handleLogin(req, res, sql) {
  const body = readJsonBody(req);
  const phone = cleanPhone(body.phone);
  const pin = body.pin;
  if (!phone) {
    return sendJson(res, 400, { ok: false, error: 'Telefon gerekli' });
  }
  if (!isValidPinFormat(pin)) {
    return sendJson(res, 400, { ok: false, error: 'PIN 4 veya 6 haneli olmalı.' });
  }

  const customer = await findCustomerByPhone(sql, phone);
  if (!customer) {
    return sendJson(res, 404, { ok: false, error: 'Müşteri bulunamadı' });
  }

  const pinResult = await verifyCustomerPin(sql, phone, pin);
  if (!pinResult.ok) {
    return sendJson(res, pinResult.status || 401, {
      ok: false,
      error: pinResult.error,
      code: pinResult.code || null
    });
  }

  const isAdmin = Boolean(customer.is_admin);
  const session = await createSession(sql, {
    customerId: customer.id,
    role: isAdmin ? 'admin' : 'user',
    deviceId: String(body.deviceId || '')
  });
  const loyalty = await loadLoyaltyForCustomer(sql, customer.id);

  return sendJson(res, 200, {
    ok: true,
    customerId: Number(customer.id),
    sessionToken: session.token,
    customer: toCustomerSnapshot(customer),
    loyalty,
    isAdmin
  });
}

async function handleSessionOrMe(req, res, sql) {
  const session = await resolveSession(sql, req);
  if (!session) {
    return sendJson(res, 401, { ok: false, error: 'Oturum gerekli' });
  }
  const payload = await buildMePayload(sql, session);
  if (!payload) {
    return sendJson(res, 401, { ok: false, error: 'Oturum geçersiz' });
  }
  return sendJson(res, 200, payload);
}

async function handleLogout(req, res, sql) {
  const token = readAuthToken(req);
  await destroySession(sql, token);
  return sendJson(res, 200, { ok: true });
}

async function handleWarm(_req, res, sql) {
  if (!sql) {
    return sendJson(res, 503, { ok: false, error: 'DATABASE_URL eksik' });
  }
  await sql`SELECT 1 AS ok`;
  return sendJson(res, 200, { ok: true, warm: true });
}

// Liberte Next auth — Guardian yok
export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const action = String(req.query?.action || '').trim().toLowerCase();
  const sql = getSql();

  try {
    if (action === 'warm') {
      return handleWarm(req, res, sql);
    }

    if (!sql) {
      return sendJson(res, 503, { ok: false, error: 'Veritabanı yapılandırılmadı' });
    }

    if (action === 'login') {
      if (req.method !== 'POST') {
        return sendJson(res, 405, { ok: false, error: 'POST gerekli' });
      }
      return handleLogin(req, res, sql);
    }

    if (action === 'logout') {
      return handleLogout(req, res, sql);
    }

    if (action === 'session' || action === 'me') {
      return handleSessionOrMe(req, res, sql);
    }

    return sendJson(res, 404, { ok: false, error: 'Bilinmeyen action' });
  } catch (error) {
    console.error('[n-auth]', error?.message || error);
    return sendJson(res, 500, { ok: false, error: 'Sunucu hatası' });
  }
}
