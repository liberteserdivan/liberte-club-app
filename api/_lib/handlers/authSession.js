import { applyCors } from '../http.js';
import { destroySession, getSessionForBootstrap, readAuthToken } from '../auth.js';
import { createRequestTrace } from '../requestTrace.js';
import { withRealtimeToken } from '../supabaseRealtimeJwt.js';
import { isTransientDbError, publicDbErrorCode, publicDbErrorMessage } from '../dbTransient.js';

// Vercel platform timeout'undan önce kontrollü JSON — iç DB helper takılsa bile
const SESSION_ROUTE_DEADLINE_MS = 9000;

// Rota süresi aşıldı mı?
function isSessionRouteTimeout(e) {
  return e?.code === 'SESSION_ROUTE_TIMEOUT';
}

// Tüm DB işini üst sınır ile sarmala
async function withSessionRouteDeadline(task, deadlineMs = SESSION_ROUTE_DEADLINE_MS) {
  let timer;
  try {
    return await Promise.race([
      task(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(Object.assign(new Error('session route deadline'), { code: 'SESSION_ROUTE_TIMEOUT' }));
        }, deadlineMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// Oturum okuma ve çıkış — yalnızca session doğrulama + minimal müşteri/loyalty
export async function handleAuthSession(req, res) {
  applyCors(req, res, 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const trace = createRequestTrace('auth.session-restore');
    try {
      await withSessionRouteDeadline(() => destroySession(req, res));
      trace.log('logout_ok', { step: 'logout', status: 'ok' });
      return res.status(200).json({ ok: true, requestId: trace.requestId });
    } catch (e) {
      trace.log('logout_error', { step: 'logout', error: e?.message || String(e) });
      if (isTransientDbError(e) || isSessionRouteTimeout(e)) {
        return res.status(503).json(trace.failBody(
          'session_unavailable',
          'SESSION_TEMPORARILY_UNAVAILABLE',
          'Oturum şu an doğrulanamıyor. Giriş yapmayı deneyebilirsiniz.'
        ));
      }
      return res.status(500).json(trace.failBody(
        'logout',
        publicDbErrorCode(e, 'LOGOUT_FAILED'),
        publicDbErrorMessage(e, 'Çıkış yapılamadı. Lütfen tekrar deneyin.')
      ));
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

    // Tek katman: getSessionForBootstrap içinde runSqlSessionBootstrap (~3.6sn üst sınır).
    const session = await withSessionRouteDeadline(() => getSessionForBootstrap(req));
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
      adminVerified: session.adminVerified,
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

    if (isTransientDbError(e) || isSessionRouteTimeout(e)) {
      return res.status(503).json(trace.failBody(
        'session_unavailable',
        'SESSION_TEMPORARILY_UNAVAILABLE',
        'Oturum şu an doğrulanamıyor. Giriş yapmayı deneyebilirsiniz.'
      ));
    }

    return res.status(500).json(trace.failBody(
      'catch_error',
      publicDbErrorCode(e, 'SESSION_RESTORE_FAILED'),
      publicDbErrorMessage(e, 'Oturum okunamadı. Lütfen tekrar giriş yap.')
    ));
  }
}
