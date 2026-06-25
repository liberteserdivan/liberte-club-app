import { handlePushRegisterDevice } from './_lib/handlers/pushRegisterDevice.js';
import { handleAdminPushSend } from './_lib/handlers/adminPushSend.js';
import { withSqlRequest } from './_lib/sqlRequest.js';

const PUSH_ACTIONS = {
  'register-device': handlePushRegisterDevice,
  send: handleAdminPushSend
};

export default withSqlRequest(async function handler(req, res) {
  const action = String(req.query?.action || '').trim().toLowerCase();

  if (action === 'send') {
    return handleAdminPushSend(req, res);
  }

  const route = PUSH_ACTIONS[action];
  if (!route) {
    return res.status(400).json({ error: 'Geçersiz push action' });
  }

  return route(req, res);
});
