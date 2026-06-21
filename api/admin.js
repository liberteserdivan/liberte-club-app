import { handleAdminBackup } from './_lib/handlers/adminBackup.js';
import { handleAdminPushSend } from './_lib/handlers/adminPushSend.js';
import { handleAdminPushCleanup } from './_lib/handlers/adminPushCleanup.js';
import { handleAdminAccountDelete } from './_lib/handlers/adminAccountDelete.js';
import { handleAdminLoyaltyAction, handleAdminQrVerify } from './_lib/handlers/adminLoyalty.js';
import { handleAdminReviewAction } from './_lib/handlers/adminReview.js';
import { handleAdminMemberDelete } from './_lib/handlers/adminMemberDelete.js';
import { handleAdminMembers } from './_lib/handlers/adminMembers.js';
import { handleAdminMemberLoyalty } from './_lib/handlers/adminMemberLoyalty.js';

// Yönetici ve hesap işlemleri — Vercel Hobby 12 function limiti
const ADMIN_RESOURCES = {
  backup: handleAdminBackup,
  members: handleAdminMembers,
  'member-loyalty': handleAdminMemberLoyalty,
  'push-send': handleAdminPushSend,
  'push-cleanup': handleAdminPushCleanup,
  'account-delete': handleAdminAccountDelete,
  'member-delete': handleAdminMemberDelete,
  'qr-verify': handleAdminQrVerify,
  'loyalty-action': handleAdminLoyaltyAction,
  'review-action': handleAdminReviewAction
};

export default async function handler(req, res) {
  const resource = String(req.query?.resource || '').trim().toLowerCase();
  const route = ADMIN_RESOURCES[resource];

  if (!route) {
    return res.status(400).json({ error: 'Geçersiz admin resource' });
  }

  return route(req, res);
}
