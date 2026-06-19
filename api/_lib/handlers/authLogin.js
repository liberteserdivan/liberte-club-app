import { getSql } from '../appState.js';
import { applyCors, readBody } from '../http.js';
import { cleanPhone } from '../phone.js';
import { enforceAuthRateLimit } from '../rateLimit.js';
import { createRequestTrace } from '../requestTrace.js';
import { hasCustomerPinAuth } from '../customerEmails.js';
import {
  createSession,
  getSession,
  indexCustomerEmail,
  readAuthToken,
  toCustomerSnapshot,
  findCustomerByPhone
} from '../auth.js';
import { isValidPinFormat, normalizePin, verifyCustomerPin } from '../pinAuth.js';
import { findLoyaltyByCustomerId, loyaltyRowToCard } from '../customersStore.js';

// Oturumdaki müşteri girilen telefonla eşleşiyor mu?
function sessionMatchesPhone(session, normalizedPhone) {
  if (!session?.customer?.phone) return false;
  return cleanPhone(session.customer.phone) === normalizedPhone;
}

// Başarılı giriş yanıtını oluştur — sadakat kartı dahil
async function buildLoginSuccessBody(trace, customer, sessionMeta, existing = null) {
  const sql = getSql();
  let loyalty = null;
  if (sql && customer?.id) {
    const row = await findLoyaltyByCustomerId(sql, customer.id);
    loyalty = row ? loyaltyRowToCard(row, customer.id) : null;
  }

  return {
    ok: true,
    requestId: trace.requestId,
    customerId: customer.id,
    role: sessionMeta.role,
    isAdmin: Boolean(customer.isAdmin),
    adminVerified: Boolean(existing?.adminVerified),
    sessionToken: sessionMeta.token || undefined,
    next: 'home',
    customer: toCustomerSnapshot(customer),
    loyalty,
    timings: trace.successTimings()
  };
}

// Giriş — telefon + PIN; normalize tablo üzerinden
export async function handleAuthLogin(req, res) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const trace = createRequestTrace('auth.customer-login');
  const startedAt = Date.now();

  try {
    const body = readBody(req);
    const rawPhone = String(body.phone || '').trim();
    const phone = cleanPhone(rawPhone);
    const pin = normalizePin(body.pin);
    const deviceId = String(body.deviceId || '').trim();

    trace.markStep('parse_body');

    if (phone.length < 10) {
      return res.status(400).json(trace.failBody('validate', 'VALIDATION', 'Telefon eksik'));
    }
    if (!process.env.DATABASE_URL) {
      return res.status(500).json(trace.failBody('database', 'DATABASE_URL', 'Veritabanı yapılandırması eksik'));
    }

    if (await enforceAuthRateLimit(req, 'auth_login', { maxHits: 20 })) {
      return res.status(429).json(trace.failBody('rate_limit', 'RATE_LIMITED', 'Çok fazla deneme. Lütfen bir süre sonra tekrar dene.'));
    }

    const existing = await getSession(req);
    trace.markStep('session_read');

    let customer = sessionMatchesPhone(existing, phone) ? existing.customer : null;
    if (!customer) {
      customer = await findCustomerByPhone(phone);
    }

    trace.log('lookup', {
      rawPhone,
      normalizedPhone: phone,
      step: 'customer_lookup',
      foundCustomer: Boolean(customer),
      customerId: customer?.id || null,
      role: customer?.isAdmin ? 'admin' : 'user',
      isAdmin: Boolean(customer?.isAdmin)
    });

    if (!customer) {
      return res.status(404).json(trace.failBody(
        'customer_lookup',
        'CUSTOMER_NOT_FOUND',
        'Bu telefon ile kayıt bulunamadı. Önce kayıt olun.'
      ));
    }

    const expectedRole = customer.isAdmin ? 'admin' : 'user';
    if (
      existing
      && sessionMatchesPhone(existing, phone)
      && Number(existing.customerId) === Number(customer.id)
      && existing.role === expectedRole
      && readAuthToken(req)
    ) {
      const bodyOk = await buildLoginSuccessBody(trace, customer, {
        role: existing.role,
        token: readAuthToken(req)
      }, existing);
      trace.log('session_reuse', { customerId: customer.id, status: 'ok', durationMs: Date.now() - startedAt });
      return res.status(200).json(bodyOk);
    }

    if (!isValidPinFormat(pin)) {
      return res.status(400).json(trace.failBody('validate_pin', 'VALIDATION', 'PIN 4 veya 6 haneli olmalı.'));
    }

    const sql = getSql();
    if (!sql) {
      return res.status(500).json(trace.failBody('database', 'DATABASE_URL', 'Veritabanı yapılandırması eksik'));
    }

    const hasPinAuth = await hasCustomerPinAuth(sql, phone);
    trace.markStep('pin_lookup');

    const verified = await verifyCustomerPin(sql, phone, pin);
    trace.markStep('pin_verify');

    trace.log('pin_result', {
      hasPinAuth,
      pinVerifyResult: verified.ok,
      code: verified.code || null,
      customerId: customer.id
    });

    if (!verified.ok) {
      const message = verified.code === 'PIN_INVALID'
        ? 'PIN hatalı.'
        : verified.code === 'PIN_NOT_FOUND'
          ? 'Bu hesap için PIN bulunamadı.'
          : (verified.error || 'PIN doğrulanamadı.');
      return res.status(verified.status).json({
        ok: false,
        requestId: trace.requestId,
        step: 'pin_verify',
        code: verified.code || 'PIN_VERIFY_FAILED',
        error: message,
        message,
        lockedUntil: verified.lockedUntil || null
      });
    }

    await indexCustomerEmail(customer);

    let session;
    try {
      session = await createSession(res, {
        customerId: customer.id,
        role: expectedRole,
        deviceId,
        sql
      });
    } catch (sessionError) {
      console.error('[auth.customer-login]', trace.requestId, sessionError?.message || sessionError);
      return res.status(500).json(trace.failBody(
        'session_create',
        'SESSION_CREATE_FAILED',
        'Oturum oluşturulamadı. Lütfen tekrar dene.'
      ));
    }
    trace.markStep('session_create');

    trace.log('complete_ok', {
      customerId: customer.id,
      role: session.role,
      isAdmin: session.isAdmin,
      sessionCreated: true,
      status: 'ok',
      durationMs: Date.now() - startedAt
    });

    const bodyOk = await buildLoginSuccessBody(trace, customer, session);
    return res.status(200).json(bodyOk);
  } catch (e) {
    console.error('[auth.customer-login]', trace.requestId, e?.stack || e?.message || e);
    return res.status(500).json(trace.failBody('unexpected', 'LOGIN_FAILED', e.message || 'Giriş yapılamadı'));
  }
}
