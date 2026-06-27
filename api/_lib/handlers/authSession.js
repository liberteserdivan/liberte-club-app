import { applyCors } from '../http.js';
import { destroySession, getSessionForBootstrap, readAuthToken } from '../auth.js';
import { createRequestTrace } from '../requestTrace.js';
import { withRealtimeToken } from '../supabaseRealtimeJwt.js';
import { publicDbErrorCode, publicDbErrorMessage, withSqlRetry } from '../dbTransient.js';
import { resetSqlClient } from '../sql.js';

// Oturum okuma ve çıkış
export async function handleAuthSession(req, res) {
  applyCors(req, res, 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const trace = createRequestTrace('auth.session-restore');
    try {
      await destroySession(req, res);
      trace.log('logout_ok', { step: 'logout', status: 'ok' });
      return res.status(200).json({ ok: true, requestId: trace.requestId });
    } catch (e) {
      trace.log('logout_error', { step: 'logout', error: e?.message || String(e) });
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

  try {
    const hasSessionToken = Boolean(readAuthToken(req));
    trace.log('start', { step: 'start', hasSessionToken });

    // Bootstrap salt-okunur ve hafif; bayat bağlantıda 6sn'de vazgeçip taze
    // bağlantıyla yeniden dener (uygulama açılışı/çıkış sonrası takılmayı önler)
    const session = await withSqlRetry(
      () => getSessionForBootstrap(req),
      { resetClient: resetSqlClient, attemptTimeoutMs: 6000 }
    );
    trace.log('verify_session', {
      step: 'verify_session',
      hasSessionToken,
      sessionValid: Boolean(session?.customerId),
      customerId: session?.customerId || null,
      hasCustomerSnapshot: Boolean(session?.customer),
      durationMs: Date.now() - startedAt
    });

    if (!session?.customerId) {
      return res.status(200).json({ ok: false, requestId: trace.requestId });
    }

    const sessionToken = readAuthToken(req) || undefined;

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
    return res.status(500).json(trace.failBody(
      'catch_error',
      publicDbErrorCode(e, 'SESSION_RESTORE_FAILED'),
      publicDbErrorMessage(e, 'Oturum okunamadı. Lütfen tekrar giriş yap.')
    ));
  }
}
