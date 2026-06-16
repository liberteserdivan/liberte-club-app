import { applyCors, publicErrorMessage, readBodySafe } from '../http.js';
import { loadAppState, saveAppState } from '../appState.js';
import { requireAdminSession } from '../auth.js';
import { verifyCustomerQrToken } from '../qrToken.js';
import {
  applyCategoryStamp,
  applyCheckIn,
  applyBirthdayCoffee,
  applyTierDiscount,
  customerSummary,
  redeemCategoryReward
} from '../loyaltyOps.js';
import { menuItems } from '../../../src/lib/menuSeed.js';

// QR token doğrula — kasiyer müşteri kartını açar
export async function handleAdminQrVerify(req, res) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = await requireAdminSession(req, res, { pinRequired: true });
  if (!session) return;

  try {
    const body = readBodySafe(req);
    const verified = verifyCustomerQrToken(body.token);
    if (!verified.ok) {
      return res.status(400).json({ error: verified.error });
    }

    const remote = await loadAppState();
    if (!remote.data) return res.status(404).json({ error: 'Veri bulunamadı' });

    const customer = customerSummary(remote.data, verified.customerId);
    if (!customer) return res.status(404).json({ error: 'Müşteri bulunamadı' });

    return res.status(200).json({ ok: true, customer });
  } catch (error) {
    return res.status(500).json({ error: publicErrorMessage(error, 'QR doğrulanamadı') });
  }
}

// İmzalı QR ile damga / ikram / check-in — sunucu doğrular
export async function handleAdminLoyaltyAction(req, res) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = await requireAdminSession(req, res, { pinRequired: true });
  if (!session) return;

  try {
    const body = readBodySafe(req);
    const verified = verifyCustomerQrToken(body.token);
    if (!verified.ok) {
      return res.status(400).json({ error: verified.error });
    }

    const remote = await loadAppState();
    if (!remote.data) return res.status(404).json({ error: 'Veri bulunamadı' });

    const nextState = structuredClone(remote.data);
    const action = String(body.action || '').trim();
    const category = String(body.category || 'coffee').trim();
    const menuItemId = body.menuItemId != null ? Number(body.menuItemId) : null;
    const menuItem = menuItemId
      ? menuItems.find((item) => Number(item.id) === menuItemId) || null
      : null;
    let result;

    if (action === 'stamp') {
      result = applyCategoryStamp(nextState, verified.customerId, category, 1, 'QR kamera', { menuItem });
    } else if (action === 'remove') {
      result = applyCategoryStamp(nextState, verified.customerId, category, -1, 'QR düzeltme');
    } else if (action === 'redeem') {
      result = redeemCategoryReward(nextState, verified.customerId, category, 'QR kasiyer');
    } else if (action === 'checkin') {
      result = applyCheckIn(nextState, verified.customerId, 'Kasa QR check-in');
    } else if (action === 'tier_discount') {
      result = applyTierDiscount(nextState, verified.customerId, 'QR kasiyer');
    } else if (action === 'birthday_coffee') {
      result = applyBirthdayCoffee(nextState, verified.customerId, 'QR kasiyer');
    } else {
      return res.status(400).json({ error: 'Geçersiz işlem' });
    }

    if (!result.ok) {
      return res.status(400).json({ error: result.error || 'İşlem yapılamadı' });
    }

    await saveAppState(nextState);
    const customer = customerSummary(nextState, verified.customerId);

    return res.status(200).json({
      ok: true,
      customer,
      loyalty: customer?.loyalty || null
    });
  } catch (error) {
    return res.status(500).json({ error: publicErrorMessage(error, 'Sadakat işlemi başarısız') });
  }
}
