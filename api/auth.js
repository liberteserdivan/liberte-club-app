import { handleAuthLogin } from './_lib/handlers/authLogin.js';
import { handleAuthSession } from './_lib/handlers/authSession.js';
import { handleAuthRegisterComplete } from './_lib/handlers/authRegisterComplete.js';
import { handleAuthForgotPin } from './_lib/handlers/authForgotPin.js';
import { handleAuthAdminPin } from './_lib/handlers/authAdminPin.js';

// Kimlik doğrulama yönlendirici — Vercel Hobby 12 function limiti
const AUTH_ACTIONS = {
  login: handleAuthLogin,
  session: handleAuthSession,
  'register-complete': handleAuthRegisterComplete,
  'forgot-pin': handleAuthForgotPin,
  'admin-pin': handleAuthAdminPin
};

export default async function handler(req, res) {
  const action = String(req.query?.action || '').trim().toLowerCase();
  const route = AUTH_ACTIONS[action];

  if (!route) {
    return res.status(400).json({ error: 'Geçersiz auth action' });
  }

  return route(req, res);
}
