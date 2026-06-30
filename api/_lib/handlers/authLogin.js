import { getSql } from '../appState.js';
import { applyCors, readBody } from '../http.js';
import { cleanPhone } from '../phone.js';
import { enforceAuthRateLimit } from '../rateLimit.js';
import { createRequestTrace } from '../requestTrace.js';
import { hasCustomerPinAuth } from '../customerEmails.js';
import {
  createSessionOnce,
  getSessionIdentityForLogin,
  indexCustomerEmail,
  readAuthToken,
  toCustomerSnapshot
} from '../auth.js';
import { isValidPinFormat, normalizePin, verifyCustomerPin } from '../pinAuth.js';
import { findLoyaltyByCustomerId, loyaltyRowToCard } from '../customersStore.js';
import { withRealtimeToken } from '../supabaseRealtimeJwt.js';
import { publicDbErrorCode, publicDbErrorMessage, isTransientDbError } from '../dbTransient.js';
import { primeSqlConnection } from '../sql.js';
import { runSqlLoginRead } from '../runSql.js';
import { ROUTE_TIMING } from '../routeTiming.js';
import { isRouteDeadlineError, withRouteDeadline } from '../routeDeadline.js';

// Rate-limit DB geçici çökerse girişi kilitleme — best-effort, fail-open
async function isLoginRateLimited(req, action, options) {
  try {
    return await enforceAuthRateLimit(req, action, options);
  } catch (error) {
    console.warn('[auth.customer-login] rate_limit_skip', error?.message || error);
    return false;
  }
}

// Başarılı giriş yanıtının çekirdek alanları (DB/imza gerektirmez).
function loginBodyCore(trace, customer, sessionMeta, existing, loyalty) {
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

// Minimal başarı gövdesi — enrichment başarısız olsa bile dönebilir
function buildPlainLoginBody(trace, customer, sessionMeta, existing = null) {
  const core = loginBodyCore(trace, customer, sessionMeta, existing, null);
  try {
    return withRealtimeToken(core, {
      customerId: customer.id,
      isAdmin: Boolean(customer.isAdmin),
      adminVerified: Boolean(existing?.adminVerified)
    });
  } catch {
    return core;
  }
}

// Sadakat kartı opsiyonel — hata login'i bloklamaz
async function buildLoginSuccessBody(trace, customer, sessionMeta, existing = null) {
  const sql = getSql();
  let loyalty = null;
  if (sql && customer?.id) {
    try {
      const row = await findLoyaltyByCustomerId(sql, customer.id);
      loyalty = row ? loyaltyRowToCard(row, customer.id) : null;
    } catch {
      loyalty = null;
    }
  }

  try {
    return withRealtimeToken(
      loginBodyCore(trace, customer, sessionMeta, existing, loyalty),
      {
        customerId: customer.id,
        isAdmin: Boolean(customer.isAdmin),
        adminVerified: Boolean(existing?.adminVerified)
      }
    );
  } catch {
    return loginBodyCore(trace, customer, sessionMeta, existing, loyalty);
  }
}

// Giriş — telefon + PIN; kimlik doğrulama + oturum oluşturma kritik yol
export async function handleAuthLogin(req, res) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const trace = createRequestTrace('auth.customer-login');
  const startedAt = Date.now();

  try {
    await withRouteDeadline(async () => {
      await primeSqlConnection(1500).catch(() => {});

      const loginPhone = cleanPhone(String(readBody(req).phone || '').trim());
      if (loginPhone.length >= 10
        && await isLoginRateLimited(req, 'auth_login', { maxHits: 15, identifier: loginPhone })) {
        return res.status(429).json(trace.failBody(
          'rate_limit',
          'RATE_LIMITED',
          'Çok fazla deneme. Lütfen bir süre sonra tekrar dene.'
        ));
      }
      if (await isLoginRateLimited(req, 'auth_login_ip', { maxHits: 80 })) {
        return res.status(429).json(trace.failBody(
          'rate_limit',
          'RATE_LIMITED',
          'Çok fazla deneme. Lütfen bir süre sonra tekrar dene.'
        ));
      }

      // Kimlik doğrulama — tek bounded read katmanı; loadAppState/sync YOK
      const outcome = await runSqlLoginRead(() => resolveLoginOutcome(req, trace));

      if (outcome.kind === 'error') {
        return res.status(outcome.status).json(outcome.body);
      }

      if (outcome.kind === 'reuse') {
        const reuseMeta = { role: outcome.role, token: outcome.token };
        let bodyOk;
        try {
          bodyOk = await buildLoginSuccessBody(trace, outcome.customer, reuseMeta, outcome.existing);
        } catch {
          bodyOk = buildPlainLoginBody(trace, outcome.customer, reuseMeta, outcome.existing);
        }
        trace.log('session_reuse', { customerId: outcome.customer.id, status: 'ok', durationMs: Date.now() - startedAt });
        return res.status(200).json(bodyOk);
      }

      await indexCustomerEmail(outcome.customer).catch(() => {});

      let session;
      try {
        // Oturum yazımı — tek deneme, retry yok (çift session riski)
        session = await createSessionOnce(res, {
          customerId: outcome.customer.id,
          role: outcome.role,
          deviceId: outcome.deviceId,
          sql: getSql()
        });
      } catch (sessionError) {
        console.error('[auth.customer-login]', trace.requestId, sessionError?.message || sessionError);
        if (isTransientDbError(sessionError)) {
          return res.status(503).json(trace.failBody(
            'session_create',
            'LOGIN_TEMPORARILY_UNAVAILABLE',
            'Giriş şu an tamamlanamıyor. Lütfen birkaç saniye sonra tekrar deneyin.'
          ));
        }
        return res.status(500).json(trace.failBody(
          'session_create',
          'SESSION_CREATE_FAILED',
          'Oturum oluşturulamadı. Lütfen tekrar dene.'
        ));
      }
      trace.markStep('session_create');

      trace.log('complete_ok', {
        customerId: outcome.customer.id,
        role: session.role,
        isAdmin: session.isAdmin,
        sessionCreated: true,
        status: 'ok',
        durationMs: Date.now() - startedAt
      });

      let bodyOk;
      try {
        bodyOk = await buildLoginSuccessBody(trace, outcome.customer, session);
      } catch {
        bodyOk = buildPlainLoginBody(trace, outcome.customer, session);
      }
      return res.status(200).json(bodyOk);
    }, ROUTE_TIMING.LOGIN_MS, 'auth-login');
  } catch (e) {
    console.error('[auth.customer-login]', trace.requestId, e?.stack || e?.message || e);
    if (isTransientDbError(e) || isRouteDeadlineError(e)) {
      return res.status(503).json(trace.failBody(
        'login_unavailable',
        'LOGIN_TEMPORARILY_UNAVAILABLE',
        'Giriş şu an tamamlanamıyor. Lütfen birkaç saniye sonra tekrar deneyin.'
      ));
    }
    return res.status(500).json(trace.failBody(
      'unexpected',
      publicDbErrorCode(e, 'LOGIN_FAILED'),
      publicDbErrorMessage(e, 'Giriş yapılamadı. Lütfen tekrar dene.')
    ));
  }
}

// Giriş okuma + doğrulama — res'e yazmaz, yalnızca sonuç tarifi döndürür
async function resolveLoginOutcome(req, trace) {
  const body = readBody(req);
  const rawPhone = String(body.phone || '').trim();
  const phone = cleanPhone(rawPhone);
  const pin = normalizePin(body.pin);
  const deviceId = String(body.deviceId || '').trim();

  trace.markStep('parse_body');

  if (phone.length < 10) {
    return { kind: 'error', status: 400, body: trace.failBody('validate', 'VALIDATION', 'Telefon eksik') };
  }
  if (!process.env.DATABASE_URL) {
    return { kind: 'error', status: 500, body: trace.failBody('database', 'DATABASE_URL', 'Veritabanı yapılandırması eksik') };
  }

  const sql = getSql();
  if (!sql) {
    return { kind: 'error', status: 500, body: trace.failBody('database', 'DATABASE_URL', 'Veritabanı yapılandırması eksik') };
  }

  // Hafif oturum kimliği — getSession/syncSessionWithCustomer/loadAppState YOK
  const existing = await getSessionIdentityForLogin(req);
  trace.markStep('session_read');

  const { findCustomerByPhone: findByPhoneSql } = await import('../customersStore.js');
  const customer = await findByPhoneSql(sql, phone);
  const hasPinAuth = await hasCustomerPinAuth(sql, phone);

  trace.log('lookup', {
    rawPhone,
    normalizedPhone: phone,
    step: 'customer_lookup',
    foundCustomer: Boolean(customer),
    customerId: customer?.id || null,
    hasPinAuth,
    role: customer?.isAdmin ? 'admin' : 'user',
    isAdmin: Boolean(customer?.isAdmin)
  });

  if (!customer) {
    if (hasPinAuth) {
      return { kind: 'error', status: 500, body: trace.failBody(
        'customer_repair',
        'CUSTOMER_REPAIR_FAILED',
        'Hesap kaydı eksik görünüyor. Destek ile iletişime geçin veya PIN sıfırlamayı deneyin.'
      ) };
    }
    return { kind: 'error', status: 404, body: trace.failBody(
      'customer_lookup',
      'CUSTOMER_NOT_FOUND',
      'Bu telefon ile kayıt bulunamadı. Önce kayıt olun.'
    ) };
  }

  const expectedRole = customer.isAdmin ? 'admin' : 'user';
  const token = readAuthToken(req);
  if (
    existing
    && token
    && Number(existing.customerId) === Number(customer.id)
    && existing.role === expectedRole
  ) {
    return { kind: 'reuse', customer, role: existing.role, token, existing };
  }

  if (!isValidPinFormat(pin)) {
    return { kind: 'error', status: 400, body: trace.failBody('validate_pin', 'VALIDATION', 'PIN 4 veya 6 haneli olmalı.') };
  }

  trace.markStep('pin_lookup');
  trace.log('pin_check', { rawPhone, normalizedPhone: phone, hasPinAuth, customerId: customer.id });

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
        ? 'Bu hesap için PIN bulunamadı. PIN sıfırlayın.'
        : (verified.error || 'PIN doğrulanamadı.');
    return { kind: 'error', status: verified.status, body: {
      ok: false,
      requestId: trace.requestId,
      step: 'pin_verify',
      code: verified.code || 'PIN_VERIFY_FAILED',
      error: message,
      message,
      lockedUntil: verified.lockedUntil || null
    } };
  }

  return { kind: 'success', customer, role: expectedRole, existing, deviceId };
}
