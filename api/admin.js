// Yönetici yönlendirici — handler'lar ihtiyaç anında yüklenir (Firebase ağır modülleri atlanır)
import { withSqlRequest } from './_lib/sqlRequest.js';

const ADMIN_RESOURCE_LOADERS = {
  backup: () => import('./_lib/handlers/adminBackup.js').then((m) => m.handleAdminBackup),
  members: () => import('./_lib/handlers/adminMembers.js').then((m) => m.handleAdminMembers),
  'member-loyalty': () => import('./_lib/handlers/adminMemberLoyalty.js').then((m) => m.handleAdminMemberLoyalty),
  'member-loyalty-bulk': () => import('./_lib/handlers/adminMemberLoyaltyBulk.js').then((m) => m.handleAdminMemberLoyaltyBulk),
  'push-send': () => import('./_lib/handlers/adminPushSend.js').then((m) => m.handleAdminPushSend),
  'push-cleanup': () => import('./_lib/handlers/adminPushCleanup.js').then((m) => m.handleAdminPushCleanup),
  'account-delete': () => import('./_lib/handlers/adminAccountDelete.js').then((m) => m.handleAdminAccountDelete),
  'member-delete': () => import('./_lib/handlers/adminMemberDelete.js').then((m) => m.handleAdminMemberDelete),
  'qr-verify': () => import('./_lib/handlers/adminLoyalty.js').then((m) => m.handleAdminQrVerify),
  'loyalty-action': () => import('./_lib/handlers/adminLoyalty.js').then((m) => m.handleAdminLoyaltyAction),
  'review-action': () => import('./_lib/handlers/adminReview.js').then((m) => m.handleAdminReviewAction)
};

export default withSqlRequest(async function handler(req, res) {
  const resource = String(req.query?.resource || '').trim().toLowerCase();
  const loader = ADMIN_RESOURCE_LOADERS[resource];

  if (!loader) {
    return res.status(400).json({ error: 'Geçersiz admin resource' });
  }

  const route = await loader();
  return route(req, res);
});
