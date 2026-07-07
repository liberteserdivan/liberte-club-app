import { applyCors, sendApiError } from '../http.js';
import { destroySession, getSessionForBootstrap, readAuthToken } from '../auth.js';
import { createRequestTrace } from '../requestTrace.js';
import { withRealtimeToken } from '../supabaseRealtimeJwt.js';
import { ROUTE_TIMING } from '../routeTiming.js';
import { withRouteDeadline } from '../routeDeadline.js';

// Oturum okuma ve çıkış — yalnızca session doğrulama + minimal müşteri/loyalty
export async function handleAuthSession(req, res) {
  applyCors(req, res, 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const trace = createRequestTrace('auth.session-restore');
    try {
      await withRouteDeadline(() => destroySession(req, res), ROUTE_TIMING.SESSION_WITH_TOKEN_MS, 'session-logout');
      trace.log('logout_ok', { step: 'logout', status: 'ok' });
      return res.status(200).json({ ok: true, requestId: trace.requestId });
    } catch (e) {
      trace.log('logout_error', { step: 'logout', error: e?.message || String(e) });
      return sendApiError(res, {
        status: 500,
        code: 'LOGOUT_FAILED',
        message: 'Çıkış yapılamadı. Lütfen tekrar deneyin.',
        step: 'logout',
        requestId: trace.requestId,
        timings: trace.successTimings(),
        error: e
      });
    }
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const trace = createRequestTrace('auth.session-restore');
  const startedAt = Date.now();

  // Cookie/token yok — DB'ye gitmeden hızlı 401 (giriş ekranı normal akış)
  const token = readAuthToken(req);
  if (!token) {
    trace.log('no_token', { step: 'no_token', durationMs: Date.now() - startedAt });
    return res.status(401).json({
      ok: false,
      error: 'Oturum gerekli',
      requestId: trace.requestId
    });
  }

  try {
    trace.log('start', { step: 'start', hasSessionToken: true });

    const session = await withRouteDeadline(
      () => getSessionForBootstrap(req),
      ROUTE_TIMING.SESSION_WITH_TOKEN_MS,
      'session-restore'
    );
    trace.log('verify_session', {
      step: 'verify_session',
      hasSessionToken: true,
      sessionValid: Boolean(session?.customerId),
      customerId: session?.customerId || null,
      hasCustomerSnapshot: Boolean(session?.customer),
      durationMs: Date.now() - startedAt
    });

    if (!session?.customerId) {
      return res.status(401).json({
        ok: false,
        error: 'Oturum geçersiz veya süresi doldu',
        requestId: trace.requestId
      });
    }

    const sessionToken = token || undefined;

    return res.status(200).json(withRealtimeToken({
      ok: true,
      requestId: trace.requestId,
      customerId: session.customerId,
      role: session.role,
      isAdmin: session.isAdmin,
      adminVerified: session.isAdmin || Boolean(session.adminVerified),
      customer: session.customer,
      loyalty: session.loyalty || null,
      sessionToken
    }, session));
  } catch (e) {
    trace.log('catch_error', {
      step: 'catch_error',
      error: e?.message || String(e),
      durationMs: Date.now() - startedAt
    });

    return sendApiError(res, {
      status: 500,
      code: 'SESSION_RESTORE_FAILED',
      message: 'Oturum okunamadı. Lütfen tekrar giriş yap.',
      step: 'catch_error',
      requestId: trace.requestId,
      timings: trace.successTimings(),
      error: e
    });
  }
}
