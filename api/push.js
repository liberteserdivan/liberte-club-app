import { handlePushRegisterDevice } from './_lib/handlers/pushRegisterDevice.js';
import { handleAdminPushSend } from './_lib/handlers/adminPushSend.js';
import { withSqlRequest, withSqlRequestNoGuardian } from './_lib/sqlRequest.js';

// Cihaz kaydı — Guardian hydrate yok; login/ana ekranı bloklanmamalı
const registerSqlHandler = withSqlRequestNoGuardian(handlePushRegisterDevice);

// Admin push gönderimi — tam Guardian gözlemi
const sendSqlHandler = withSqlRequest(handleAdminPushSend);

export default async function pushRouter(req, res) {
  const action = String(req.query?.action || '').trim().toLowerCase();

  if (action === 'send') {
    return sendSqlHandler(req, res);
  }

  if (action === 'register-device') {
    return registerSqlHandler(req, res);
  }

  return res.status(400).json({ error: 'Geçersiz push action' });
}
