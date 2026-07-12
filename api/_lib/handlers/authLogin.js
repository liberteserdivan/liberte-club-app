import { getSql } from '../appState.js';
import { applyCors, readBody } from '../http.js';
import { cleanPhone } from '../phone.js';
import { enforceAuthRateLimit } from '../rateLimit.js';
import { createRequestTrace } from '../requestTrace.js';
import { hasCustomerPinAuth } from '../customerEmails.js';
import {
  createSessionOnce,
  hashToken,
  indexCustomerEmail,
  readAuthToken,
  toCustomerSnapshot
} from '../auth.js';
import { isValidPinFormat, normalizePin, verifyCustomerPin } from '../pinAuth.js';
import { findCustomerForLogin, findLoyaltyByCustomerId, loyaltyRowToCard } from '../customersStore.js';
import { withRealtimeToken } from '../supabaseRealtimeJwt.js';
import { publicDbErrorCode, publicDbErrorMessage, isTransientDbError } from '../dbTransient.js';
import { runSqlReadFast, getLoginReadAttemptTimeoutMs } from '../runSql.js';
import { ROUTE_TIMING } from '../routeTiming.js';
import { isRouteDeadlineError, withRouteDeadline } from '../routeDeadline.js';
import { createLoginPhaseTracker } from '../loginPhase.js';

// Rate-limit — DB gecikirse fail-open (login bloklanmaz)
async function isLoginRateLimited(req, action, options) {
  const failOpenMs = ROUTE_TIMING.LOGIN_RATE_LIMIT_FAILOPEN_MS || 900;
  try {
    const result = await Promise.race([
      enforceAuthRateLimit(req, action, options),
      new Promise((_, reject) => {
        setTimeout(() => reject(Object.assign(new Error('rate limit timeout'), { code: 'ETIMEDOUT' })), failOpenMs);
      })
    ]);
    return result;
  } catch (error) {
    console.warn('[auth.customer-login] rate_limit_skip', error?.message || error);
    return false;
  }
}

// Kontrollü 503 yanıtı için güvenli tanılama alanları
function loginUnavailableDiagnostics(phases, error) {
  return {
    error,
    queryTimeoutMs: getLoginReadAttemptTimeoutMs(),
    routeDeadline: isRouteDeadlineError(error)
  };
}

function loginBodyCore(trace, customer, sessionMeta, existing, loyalty) {
  return {
    ok: true,
    requestId: trace.requestId,
    customerId: customer.id,
    role: sessionMeta.role,
    isAdmin: Boolean(customer.isAdmin),
    adminVerified: Boolean(customer.isAdmin) || Boolean(existing?.adminVerified),
    sessionToken: sessionMeta.token || undefined,
    next: 'home',
    customer: toCustomerSnapshot(customer),
    loyalty,
    timings: trace.successTimings()
  };
}

function buildPlainLoginBody(trace, customer, sessionMeta, existing = null) {
  const core = loginBodyCore(trace, customer, sessionMeta, existing, null);
  try {
    return withRealtimeToken(core, {
      customerId: customer.id,
      isAdmin: Boolean(customer.isAdmin),
      adminVerified: Boolean(customer.isAdmin) || Boolean(existing?.adminVerified)
    });
  } catch {
    return core;
  }
}

// Loyalty okuması kısa süre içinde gelmezse düz gövde dön — login TTFB şişmesin
async function buildLoginSuccessBody(trace, customer, sessionMeta, existing = null) {
  const sql = getSql();
  let loyalty = null;
  if (sql && customer?.id) {
    try {
      const rowPromise = findLoyaltyByCustomerId(sql, customer.id)
        .then((row) => (row ? loyaltyRowToCard(row, customer.id) : null))
        .catch(() => null);
      const timeout = new Promise((resolve) => { setTimeout(() => resolve(null), 800); });
      loyalty = await Promise.race([rowPromise, timeout]);
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
        adminVerified: Boolean(customer.isAdmin) || Boolean(existing?.adminVerified)
      }
    );
  } catch {
    return loginBodyCore(trace, customer, sessionMeta, existing, loyalty);
  }
}

// Kontrollü 503 — bilinen faz adı ile
function respondLoginUnavailable(res, phases, trace, error) {
  if (phases.hasSessionCreated()) {
    const { sessionMeta, customer, existing } = phases.getSessionPayload();
    return res.status(200).json(buildPlainLoginBody(trace, customer, sessionMeta, existing));
  }

  let step = phases.getPhase();
  if (isRouteDeadlineError(error)) {
    step = error?.phase || step || 'route_deadline';
  } else if (isTransientDbError(error)) {
    step = step === 'parse_request' ? 'credential_lookup' : step;
  }

  return res.status(503).json(phases.unavailableBody(step, 'LOGIN_TEMPORARILY_UNAVAILABLE', loginUnavailableDiagnostics(phases, error)));
}

// Giriş — telefon + PIN
export async function handleAuthLogin(req, res) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const trace = createRequestTrace('auth.customer-login');
  const phases = createLoginPhaseTracker(trace, ROUTE_TIMING.LOGIN_CREDENTIAL_MS);
  const startedAt = Date.now();

  phases.setPhase('parse_request');
  const body = readBody(req);
  const loginPhone = cleanPhone(String(body.phone || '').trim());

  if (loginPhone.length < 10) {
    return res.status(400).json(trace.failBody('validate', 'VALIDATION', 'Telefon eksik'));
  }

  let outcome;
  try {
    outcome = await withRouteDeadline(async () => {
      phases.setPhase('rate_limit');
      const rateLimitStarted = Date.now();
      const [loginLimited, ipLimited] = await Promise.all([
        isLoginRateLimited(req, 'auth_login', { maxHits: 15, identifier: loginPhone }),
        isLoginRateLimited(req, 'auth_login_ip', { maxHits: 80 })
      ]);
      phases.recordRateLimitMs(Date.now() - rateLimitStarted);

      if (loginLimited || ipLimited) {
        return { kind: 'error', status: 429, body: trace.failBody('rate_limit', 'RATE_LIMITED', 'Çok fazla deneme. Lütfen bir süre sonra tekrar dene.') };
      }

      // Credential yolu: SELECT 1 prime YOK — bütçeyi PIN/müşteri sorgusuna ayır
      phases.setPhase('credential_lookup');
      return resolveLoginOutcome(req, trace, phases, body);
    }, ROUTE_TIMING.LOGIN_CREDENTIAL_MS, 'auth-login-credential', {
      getPhase: () => phases.getPhase()
    });
  } catch (error) {
    console.error('[auth.customer-login]', trace.requestId, phases.getPhase(), error?.message || error);
    if (isTransientDbError(error) || isRouteDeadlineError(error)) {
      return respondLoginUnavailable(res, phases, trace, error);
    }
    return res.status(500).json(trace.failBody(
      'unexpected',
      publicDbErrorCode(error, 'LOGIN_FAILED'),
      publicDbErrorMessage(error, 'Giriş yapılamadı. Lütfen tekrar dene.')
    ));
  }

  if (outcome.kind === 'error') {
    return res.status(outcome.status).json(outcome.body);
  }

  if (outcome.kind === 'reuse') {
    phases.setPhase('response_enrichment');
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

  phases.setPhase('session_create');
  let session;
  try {
    session = await createSessionOnce(res, {
      customerId: outcome.customer.id,
      role: outcome.role,
      deviceId: outcome.deviceId,
      sql: getSql()
    });
    phases.setPhase('set_cookie');
    phases.markSessionReady(session, outcome.customer, outcome.existing);
  } catch (sessionError) {
    console.error('[auth.customer-login]', trace.requestId, 'session_create', sessionError?.message || sessionError);
    if (isTransientDbError(sessionError)) {
      return res.status(503).json(phases.unavailableBody(
        'session_create',
        'LOGIN_TEMPORARILY_UNAVAILABLE',
        loginUnavailableDiagnostics(phases, sessionError)
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
    sessionCreated: true,
    status: 'ok',
    durationMs: Date.now() - startedAt
  });

  phases.setPhase('response_enrichment');
  let bodyOk;
  try {
    bodyOk = await buildLoginSuccessBody(trace, outcome.customer, session);
  } catch {
    bodyOk = buildPlainLoginBody(trace, outcome.customer, session);
  }
  return res.status(200).json(bodyOk);
}

// Kimlik doğrulama — tek SQL turu, state/guardian/loyalty/menu yok
async function resolveLoginOutcome(req, trace, phases, body) {
  const rawPhone = String(body.phone || '').trim();
  const phone = cleanPhone(rawPhone);
  const pin = normalizePin(body.pin);
  const deviceId = String(body.deviceId || '').trim();

  trace.markStep('parse_body');

  if (!process.env.DATABASE_URL) {
    return { kind: 'error', status: 500, body: trace.failBody('database', 'DATABASE_URL', 'Veritabanı yapılandırması eksik') };
  }

  const sql = getSql();
  if (!sql) {
    return { kind: 'error', status: 500, body: trace.failBody('database', 'DATABASE_URL', 'Veritabanı yapılandırması eksik') };
  }

  phases.setPhase('credential_lookup');

  const token = readAuthToken(req);

  // Oturum satırı ile müşteri aramasını paralel yap — toplam süreyi kısalt
  const sessionPromise = token
    ? runSqlReadFast(async () => {
      const rows = await sql`
        SELECT customer_id, role, admin_verified
        FROM auth_sessions
        WHERE token_hash = ${hashToken(token)}
          AND expires_at > now()
        LIMIT 1
      `;
      const row = rows[0];
      if (!row) return null;
      return {
        customerId: Number(row.customer_id),
        role: row.role,
        isAdmin: row.role === 'admin',
        adminVerified: row.role === 'admin' || Boolean(row.admin_verified)
      };
    })
    : Promise.resolve(null);

  const customerPromise = runSqlReadFast(() => findCustomerForLogin(sql, phone));

  const [existing, customer] = await Promise.all([sessionPromise, customerPromise]);
  trace.markStep('session_read');

  const hasPinAuth = customer
    ? false
    : await runSqlReadFast(() => hasCustomerPinAuth(sql, phone));

  trace.log('lookup', {
    phoneLen: phone.length,
    step: 'credential_lookup',
    foundCustomer: Boolean(customer),
    customerId: customer?.id || null,
    hasPinAuth
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

  phases.setPhase('credential_verify');
  trace.markStep('pin_lookup');

  const verified = await runSqlReadFast(() => verifyCustomerPin(sql, phone, pin));
  trace.markStep('pin_verify');

  if (!verified.ok) {
    const message = verified.code === 'PIN_INVALID'
      ? 'PIN hatalı.'
      : verified.code === 'PIN_NOT_FOUND'
        ? 'Bu hesap için PIN bulunamadı. PIN sıfırlayın.'
        : (verified.error || 'PIN doğrulanamadı.');
    return { kind: 'error', status: verified.status, body: {
      ok: false,
      requestId: trace.requestId,
      step: 'credential_verify',
      code: verified.code || 'PIN_VERIFY_FAILED',
      error: message,
      message,
      lockedUntil: verified.lockedUntil || null
    } };
  }

  return { kind: 'success', customer, role: expectedRole, existing, deviceId };
}
