import { handleDailyLoginClaim } from './_lib/handlers/customerLoyaltyClaim.js';

const LOYALTY_ACTIONS = {
  'daily-claim': handleDailyLoginClaim
};

export default async function handler(req, res) {
  const action = String(req.query?.action || '').trim().toLowerCase();
  const route = LOYALTY_ACTIONS[action];

  if (!route) {
    return res.status(400).json({ error: 'Geçersiz loyalty action' });
  }

  return route(req, res);
}
