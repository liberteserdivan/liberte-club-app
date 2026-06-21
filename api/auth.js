// Kimlik doğrulama yönlendirici — Vercel Hobby 12 function limiti
const AUTH_ACTIONS = {
  login: () => import('./_lib/handlers/authLogin.js').then((m) => m.handleAuthLogin),
  session: () => import('./_lib/handlers/authSession.js').then((m) => m.handleAuthSession),
  'register-complete': () => import('./_lib/handlers/authRegisterComplete.js').then((m) => m.handleAuthRegisterComplete),
  'forgot-pin': () => import('./_lib/handlers/authForgotPin.js').then((m) => m.handleAuthForgotPin),
  'admin-pin': () => import('./_lib/handlers/authAdminPin.js').then((m) => m.handleAuthAdminPin),
  // Üye listesi — auth isolate'ında DB bağlantısı güvenilir
  'admin-members': () => import('./_lib/handlers/adminMembers.js').then((m) => m.handleAdminMembers)
};

export default async function handler(req, res) {
  const action = String(req.query?.action || '').trim().toLowerCase();
  const loader = AUTH_ACTIONS[action];

  if (!loader) {
    return res.status(400).json({ error: 'Geçersiz auth action' });
  }

  const route = await loader();
  return route(req, res);
}
