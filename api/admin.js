import { handleAdminBackup } from './lib/handlers/adminBackup.js';
import { handleAdminPushSend } from './lib/handlers/adminPushSend.js';
import { handleAdminAccountDelete } from './lib/handlers/adminAccountDelete.js';

// Yönetici ve hesap işlemleri — Vercel Hobby 12 function limiti
const ADMIN_RESOURCES = {
  backup: handleAdminBackup,
  'push-send': handleAdminPushSend,
  'account-delete': handleAdminAccountDelete
};

export default async function handler(req, res) {
  const resource = String(req.query?.resource || '').trim().toLowerCase();
  const route = ADMIN_RESOURCES[resource];

  if (!route) {
    return res.status(400).json({ error: 'Geçersiz admin resource' });
  }

  return route(req, res);
}
