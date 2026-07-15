import { applyCors, publicErrorMessage, readBodySafe } from '../http.js';
import { requireAdminSession } from '../auth.js';
import { verifyCustomerQrToken } from '../qrToken.js';
import { logServerError } from '../logServerError.js';
import { useRelationalState } from '../relationalConfig.js';
import { applyLoyaltyActionRelational } from '../loyaltyStore.js';
import { menuItems } from '../../../src/lib/menuSeed.js';
import { runSql } from '../runSql.js';

// QR verify / member-lookup ayrı ince handler'da (adminQrVerify.js)

// İmzalı QR ile damga / ikram / check-in — sunucu doğrular
export async function handleAdminLoyaltyAction(req, res) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = await requireAdminSession(req, res, { light: true });
  if (!session) return;

  try {
    const body = readBodySafe(req);
    const verified = verifyCustomerQrToken(body.token);
    if (!verified.ok) {
      return res.status(400).json({ error: verified.error });
    }

    const action = String(body.action || '').trim();
    const category = String(body.category || 'coffee').trim();
    const count = Math.max(1, Math.min(10, Math.trunc(Number(body.count ?? 1) || 1)));
    const menuItemId = body.menuItemId != null ? Number(body.menuItemId) : null;
    const menuItem = menuItemId
      ? menuItems.find((item) => Number(item.id) === menuItemId) || null
      : null;

    // BUG-009: Legacy app_state loyalty yazımı emekli — yalnızca relational TX
    if (!useRelationalState()) {
      return res.status(503).json({
        error: 'Sadakat yazimi icin relational state gerekli',
        code: 'RELATIONAL_REQUIRED'
      });
    }

    // REPLAY KORUMASI nonce claim'i transaction İÇİNDE yapılır (atomik)
    const result = await runSql(() => applyLoyaltyActionRelational({
      customerId: verified.customerId,
      action,
      category,
      menuItem,
      count,
      nonce: verified.nonce
    }));

    if (result.replay) {
      return res.status(409).json({
        error: result.error || 'Bu QR kodu bu işlem için zaten kullanıldı. Müşteri ekranı QR\'ı yenilesin.',
        code: 'QR_REPLAY',
        replay: true
      });
    }

    if (!result.ok) {
      return res.status(400).json({ error: result.error || 'İşlem yapılamadı' });
    }

    return res.status(200).json({
      ok: true,
      customer: result.customer,
      loyalty: result.loyalty,
      updated_at: new Date().toISOString()
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
