import { getSql } from '../appState.js';
import { applyCors, publicErrorMessage } from '../http.js';
import { getSessionForQr, readAuthToken } from '../auth.js';
import { findCustomerById } from '../customersStore.js';
import { createCustomerQrToken, formatQrPayload, resolveQrSigningSecret } from '../qrToken.js';
import { insertErrorLog } from '../errorLogs.js';
import { createRequestTrace } from '../requestTrace.js';

// QR üretim yanıtını oluştur
function buildQrSuccessBody(trace, issued) {
  const qrPayload = formatQrPayload(issued.token);
  return {
    ok: true,
    requestId: trace.requestId,
    token: issued.token,
    qrToken: issued.token,
    qrPayload,
    expiresAt: new Date(issued.expiresAt).toISOString(),
    ttlSeconds: issued.ttlSeconds,
    serverTime: new Date().toISOString()
  };
}

// Müşteri — imzalı QR token üret (app_state kullanmaz)
export async function handleQrGenerate(req, res) {
  applyCors(req, res, 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' });
  }

  if (!process.env.DATABASE_URL) {
    return res.status(503).json({
      ok: false,
      code: 'DATABASE_URL',
      message: 'Veritabanı yapılandırması eksik'
    });
  }

  const trace = createRequestTrace('qr.generate');
  const startedAt = Date.now();
  const signing = resolveQrSigningSecret();
  const hasSessionToken = Boolean(readAuthToken(req));

  trace.log('start', {
    step: 'start',
    hasSessionToken,
    hasQrSecret: Boolean(signing.secret),
    signingSource: signing.source
  });

  if (!hasSessionToken) {
    trace.log('read_session_token', { step: 'read_session_token', hasSessionToken: false, status: 'fail' });
    return res.status(401).json(trace.failBody(
      'read_session_token',
      'SESSION_REQUIRED',
      'Oturum gerekli. Lütfen tekrar giriş yap.'
    ));
  }

  const session = await getSessionForQr(req);
  trace.log('verify_session', {
    step: 'verify_session',
    hasSessionToken,
    sessionValid: Boolean(session?.customerId),
    customerId: session?.customerId || null,
    memberNo: session?.customerId ? `LC-${session.customerId}` : null
  });

  if (!session) {
    return res.status(401).json(trace.failBody(
      'verify_session',
      'SESSION_INVALID',
      'Oturum süresi doldu. Lütfen tekrar giriş yap.'
    ));
  }

  if (session.isAdmin && session.adminVerified) {
    return res.status(403).json(trace.failBody(
      'forbidden',
      'FORBIDDEN',
      'Kasiyer modunda müşteri QR üretilemez'
    ));
  }

  if (!signing.secret) {
    await insertErrorLog({
      level: 'error',
      source: 'qr.generate',
      message: 'QR imza anahtarı yapılandırılmadı',
      code: 'QR_SECRET_MISSING',
      customerId: session.customerId,
      detail: { requestId: trace.requestId, step: 'signing_secret', hasQrSecret: false }
    });
    trace.log('signing_secret', { step: 'signing_secret', hasQrSecret: false, status: 'fail' });
    return res.status(503).json(trace.failBody(
      'signing_secret',
      'QR_SECRET_MISSING',
      'QR yapılandırması eksik. Destek ile iletişime geç.'
    ));
  }

  const sql = getSql();
  let memberNo = `LC-${session.customerId}`;

  try {
    if (sql) {
      trace.log('load_customer', { step: 'load_customer', customerId: session.customerId });
      const customer = await findCustomerById(sql, session.customerId);
      if (!customer) {
        return res.status(404).json(trace.failBody(
          'load_customer',
          'CUSTOMER_NOT_FOUND',
          'Müşteri kaydı bulunamadı.'
        ));
      }
      memberNo = `LC-${customer.id}`;
    }

    trace.log('create_payload', { step: 'create_payload', customerId: session.customerId, memberNo });
    const issued = createCustomerQrToken(session.customerId);

    trace.log('sign_token', {
      step: 'sign_token',
      customerId: session.customerId,
      memberNo,
      payloadCreated: true,
      tokenCreated: Boolean(issued.token)
    });

    trace.log('response_ok', {
      step: 'response_ok',
      customerId: session.customerId,
      memberNo,
      hasQrSecret: true,
      payloadCreated: true,
      tokenCreated: Boolean(issued.token),
      durationMs: Date.now() - startedAt,
      status: 'ok'
    });

    return res.status(200).json(buildQrSuccessBody(trace, issued));
  } catch (error) {
    await insertErrorLog({
      level: 'error',
      source: 'qr.generate',
      message: error?.message || 'QR oluşturulamadı',
      code: 'QR_GENERATE_FAILED',
      customerId: session.customerId,
      detail: {
        requestId: trace.requestId,
        step: 'catch_error',
        stack: error?.stack || null,
        durationMs: Date.now() - startedAt
      }
    });

    trace.log('catch_error', {
      step: 'catch_error',
      customerId: session.customerId,
      memberNo,
      error: error?.message || String(error),
      durationMs: Date.now() - startedAt,
      status: 'error'
    });

    return res.status(503).json(trace.failBody(
      'catch_error',
      'QR_GENERATE_FAILED',
      publicErrorMessage(error, 'QR oluşturulamadı.')
    ));
  }
}
