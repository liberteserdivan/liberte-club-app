// Yönetici yönlendirici — handler'lar ihtiyaç anında yüklenir (Firebase ağır modülleri atlanır)
import { withSqlRequest, withSqlRequestNoGuardian } from './_lib/sqlRequest.js';

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
  'member-lookup': () => import('./_lib/handlers/adminLoyalty.js').then((m) => m.handleAdminMemberLookup),
  'loyalty-action': () => import('./_lib/handlers/adminLoyalty.js').then((m) => m.handleAdminLoyaltyAction),
  'review-action': () => import('./_lib/handlers/adminReview.js').then((m) => m.handleAdminReviewAction)
};

// Kasiyer QR yolu — Guardian hydrate yok (timeout / "sunucu hatası" önlemi)
const CASHIER_FAST_RESOURCES = new Set([
  'qr-verify',
  'member-lookup',
  'loyalty-action'
]);

async function dispatchAdminResource(req, res) {
  const resource = String(req.query?.resource || '').trim().toLowerCase();
  const loader = ADMIN_RESOURCE_LOADERS[resource];

  if (!loader) {
    return res.status(400).json({ error: 'Geçersiz admin resource' });
  }

  const route = await loader();
  return route(req, res);
}

const adminFullHandler = withSqlRequest(dispatchAdminResource);
const adminCashierHandler = withSqlRequestNoGuardian(dispatchAdminResource);

export default function handler(req, res) {
  const resource = String(req.query?.resource || '').trim().toLowerCase();
  if (CASHIER_FAST_RESOURCES.has(resource)) {
    return adminCashierHandler(req, res);
  }
  return adminFullHandler(req, res);
}