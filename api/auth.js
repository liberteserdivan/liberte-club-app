// Kimlik doğrulama yönlendirici — Vercel Hobby 12 function limiti
import { applyCors } from './_lib/http.js';
import { createRequestTrace } from './_lib/requestTrace.js';
import { withSqlRequest, withSqlRequestNoGuardian } from './_lib/sqlRequest.js';

const SESSION_COOKIE = 'liberte_session';

// Hafif token okuma — getSql / withSqlRequest / auth.js import YOK
function readSessionTokenQuick(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  const cookie = req.headers.cookie || '';
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : '';
}

// Cookie/token yok — anında 401 (SQL, Guardian, schema, retry yok)
function respondSessionNoToken(req, res) {
  applyCors(req, res, 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const trace = createRequestTrace('auth.session-restore');
  return res.status(401).json({
    ok: false,
    error: 'Oturum gerekli',
    requestId: trace.requestId
  });
}

const AUTH_ACTIONS = {
  login: () => import('./_lib/handlers/authLogin.js').then((m) => m.handleAuthLogin),
  session: () => import('./_lib/handlers/authSession.js').then((m) => m.handleAuthSession),
  'register-complete': () => import('./_lib/handlers/authRegisterComplete.js').then((m) => m.handleAuthRegisterComplete),
  'forgot-pin': () => import('./_lib/handlers/authForgotPin.js').then((m) => m.handleAuthForgotPin),
  'admin-pin': () => import('./_lib/handlers/authAdminPin.js').then((m) => m.handleAuthAdminPin),
  'admin-members': () => import('./_lib/handlers/adminMembers.js').then((m) => m.handleAdminMembers),
  warm: () => import('./_lib/handlers/warmPing.js').then((m) => m.handleWarmPing)
};

const sqlHandler = withSqlRequest(async function handler(req, res) {
  const action = String(req.query?.action || '').trim().toLowerCase();
  const loader = AUTH_ACTIONS[action];

  if (!loader) {
    return res.status(400).json({ error: 'Geçersiz auth action' });
  }

  const route = await loader();
  return route(req, res);
});

// Token varken veya POST logout — SQL gerekir ama Guardian hydrate yok
const sessionSqlHandler = withSqlRequestNoGuardian(async function handler(req, res) {
  const route = await AUTH_ACTIONS.session();
  return route(req, res);
});

  // Giriş — Guardian hydrate yok; müşteri çekirdeği izole
const loginSqlHandler = withSqlRequestNoGuardian(async function handler(req, res) {
  const route = await AUTH_ACTIONS.login();
  return route(req, res);
});

// PIN unut / kayıt — Guardian hydrate yok (pooler DDL/hydrate login'i değil auth'u kilitlemesin)
const forgotPinSqlHandler = withSqlRequestNoGuardian(async function handler(req, res) {
  const route = await AUTH_ACTIONS['forgot-pin']();
  return route(req, res);
});

const registerCompleteSqlHandler = withSqlRequestNoGuardian(async function handler(req, res) {
  const route = await AUTH_ACTIONS['register-complete']();
  return route(req, res);
});

// Üye listesi — Guardian hydrate yok; admin panel hızlı yanıt
const adminMembersSqlHandler = withSqlRequestNoGuardian(async function handler(req, res) {
  const route = await AUTH_ACTIONS['admin-members']();
  return route(req, res);
});

export default async function authRouter(req, res) {
  const action = String(req.query?.action || '').trim().toLowerCase();

  // /api/auth/session — token yoksa platform 504'e gitmeden anında 401
  if (action === 'session') {
    if (req.method === 'OPTIONS') {
      applyCors(req, res, 'GET,POST,OPTIONS');
      return res.status(200).end();
    }
    if (req.method === 'GET' && !readSessionTokenQuick(req)) {
      return respondSessionNoToken(req, res);
    }
    return sessionSqlHandler(req, res);
  }

  // /api/auth/login — Guardian/bootstrap yükü yok
  if (action === 'login') {
    if (req.method === 'OPTIONS') {
      applyCors(req, res, 'POST,OPTIONS');
      return res.status(200).end();
    }
    return loginSqlHandler(req, res);
  }

  // /api/auth/forgot-pin — müşteri PIN kurtarma; Guardian hydrate yok
  if (action === 'forgot-pin') {
    if (req.method === 'OPTIONS') {
      applyCors(req, res, 'POST,OPTIONS');
      return res.status(200).end();
    }
    return forgotPinSqlHandler(req, res);
  }

  // /api/auth/register-complete — kayıt kodu/tamamlama; Guardian hydrate yok
  if (action === 'register-complete') {
    if (req.method === 'OPTIONS') {
      applyCors(req, res, 'POST,OPTIONS');
      return res.status(200).end();
    }
    return registerCompleteSqlHandler(req, res);
  }

  // /api/admin/members — Guardian hydrate yok; üye listesi hızlı yanıt
  if (action === 'admin-members') {
    if (req.method === 'OPTIONS') {
      applyCors(req, res, 'GET,OPTIONS');
      return res.status(200).end();
    }
    return adminMembersSqlHandler(req, res);
  }

  // Isınma — Guardian hydrate yok; yalnızca SELECT 1
  if (action === 'warm') {
    if (req.method === 'OPTIONS') {
      applyCors(req, res, 'GET,OPTIONS');
      return res.status(200).end();
    }
    return withSqlRequestNoGuardian(async function warmHandler(req2, res2) {
      const route = await AUTH_ACTIONS.warm();
      return route(req2, res2);
    })(req, res);
  }

  return sqlHandler(req, res);
}
