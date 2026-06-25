import { applyCors, publicErrorMessage, readBodySafe } from '../http.js';
import { loadAppState, saveAppStateIfUnchanged } from '../appState.js';
import { requireAdminSession } from '../auth.js';
import { verifyCustomerQrToken } from '../qrToken.js';
import { logServerError } from '../logServerError.js';
import { useRelationalState } from '../relationalConfig.js';
import {
  applyLoyaltyActionRelational,
  loadCustomerSummaryRelational
} from '../loyaltyStore.js';
import {
  applyCategoryStamp,
  applyCheckIn,
  applyBirthdayCoffee,
  applyTierDiscount,
  customerSummary,
  redeemCategoryReward
} from '../loyaltyOps.js';
import { menuItems } from '../../../src/lib/menuSeed.js';
import { runSql } from '../runSql.js';

// QR token doğrula — kasiyer müşteri kartını açar
export async function handleAdminQrVerify(req, res) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = await requireAdminSession(req, res, { pinRequired: true, light: true });
  if (!session) return;

  try {
    const body = readBodySafe(req);
    const verified = verifyCustomerQrToken(body.token);
    if (!verified.ok) {
      return res.status(400).json({ error: verified.error });
    }

    if (useRelationalState()) {
      const customer = await runSql(() => loadCustomerSummaryRelational(verified.customerId));
      if (!customer) return res.status(404).json({ error: 'Müşteri bulunamadı' });
      return res.status(200).json({ ok: true, customer });
    }

    const remote = await runSql(() => loadAppState());
    if (!remote.data) return res.status(404).json({ error: 'Veri bulunamadı' });

    const customer = customerSummary(remote.data, verified.customerId);
    if (!customer) return res.status(404).json({ error: 'Müşteri bulunamadı' });

    return res.status(200).json({ ok: true, customer });
  } catch (error) {
    await logServerError({
      source: 'admin.qr-verify',
      error,
      customerId: session?.customerId || null
    });
    return res.status(500).json({ error: publicErrorMessage(error, 'QR doğrulanamadı') });
  }
}

// İmzalı QR ile damga / ikram / check-in — sunucu doğrular
export async function handleAdminLoyaltyAction(req, res) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = await requireAdminSession(req, res, { pinRequired: true, light: true });
  if (!session) return;

  try {
    const body = readBodySafe(req);
    const verified = verifyCustomerQrToken(body.token);
    if (!verified.ok) {
      return res.status(400).json({ error: verified.error });
    }

    const action = String(body.action || '').trim();
    const category = String(body.category || 'coffee').trim();
    const menuItemId = body.menuItemId != null ? Number(body.menuItemId) : null;
    const menuItem = menuItemId
      ? menuItems.find((item) => Number(item.id) === menuItemId) || null
      : null;

    if (useRelationalState()) {
      const result = await runSql(() => applyLoyaltyActionRelational({
        customerId: verified.customerId,
        action,
        category,
        menuItem
      }));

      if (!result.ok) {
        return res.status(400).json({ error: result.error || 'İşlem yapılamadı' });
      }

      return res.status(200).json({
        ok: true,
        customer: result.customer,
        loyalty: result.loyalty,
        updated_at: new Date().toISOString()
      });
    }

    const remote = await runSql(() => loadAppState());
    if (!remote.data) return res.status(404).json({ error: 'Veri bulunamadı' });

    const baseUpdatedAt = remote.updatedAt;
    const nextState = structuredClone(remote.data);
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

    const saved = await saveAppStateIfUnchanged(nextState, baseUpdatedAt);
    if (!saved.ok) {
      return res.status(409).json({
        error: 'Başka bir kasa işlemi veriyi güncelledi. Lütfen QR\'ı yeniden okut.',
        conflict: true,
        updated_at: saved.updatedAt
      });
    }

    const customer = customerSummary(nextState, verified.customerId);

    return res.status(200).json({
      ok: true,
      customer,
      loyalty: customer?.loyalty || null,
      updated_at: saved.updatedAt
    });
  } catch (error) {
    await logServerError({
      source: 'admin.loyalty-action',
      error,
      customerId: session?.customerId || null
    });
    return res.status(500).json({ error: publicErrorMessage(error, 'Sadakat işlemi başarısız') });
  }
}
