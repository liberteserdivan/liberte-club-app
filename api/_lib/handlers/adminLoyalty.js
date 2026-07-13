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
import { runSql, runSqlReadFast } from '../runSql.js';
import { getSql } from '../sql.js';
import { claimQrNonce } from '../qrNonceStore.js';

// QR token doğrula — kasiyer müşteri kartını açar (süresi dolmuş imzalı QR de açılır)
export async function handleAdminQrVerify(req, res) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const session = await requireAdminSession(req, res, { light: true });
    if (!session) return;

    const body = readBodySafe(req);
    // Üye kartı için süresi dolmuş token kabul; LP işlemi ayrıca taze QR ister
    const verified = verifyCustomerQrToken(body.token, { allowExpired: true });
    if (!verified.ok) {
      return res.status(400).json({ error: verified.error, expired: Boolean(verified.expired) });
    }

    if (useRelationalState()) {
      // Fail-fast okuma — 6sn×retry zinciri kasiyeri "sunucu yanıt vermiyor"a düşürmesin
      const customer = await runSqlReadFast(() => loadCustomerSummaryRelational(verified.customerId));
      if (!customer) return res.status(404).json({ error: 'Müşteri bulunamadı' });
      return res.status(200).json({
        ok: true,
        customer,
        expired: Boolean(verified.expired),
        warning: verified.expired
          ? 'QR süresi dolmuş. Üye açıldı; LP için müşteri kartını yenilesin.'
          : null
      });
    }

    const remote = await runSqlReadFast(() => loadAppState());
    if (!remote.data) return res.status(404).json({ error: 'Veri bulunamadı' });

    const customer = customerSummary(remote.data, verified.customerId);
    if (!customer) return res.status(404).json({ error: 'Müşteri bulunamadı' });

    return res.status(200).json({
      ok: true,
      customer,
      expired: Boolean(verified.expired),
      warning: verified.expired
        ? 'QR süresi dolmuş. Üye açıldı; LP için müşteri kartını yenilesin.'
        : null
    });
  } catch (error) {
    void logServerError({
      source: 'admin.qr-verify',
      error,
      customerId: null
    });
    return res.status(500).json({ error: publicErrorMessage(error, 'QR doğrulanamadı') });
  }
}

// Üye no / LC- ile müşteri özeti — imzalı QR olmadan kart açma
export async function handleAdminMemberLookup(req, res) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const session = await requireAdminSession(req, res, { light: true });
    if (!session) return;

    const body = readBodySafe(req);
    const raw = String(body.memberId || body.query || body.id || '').trim();
    const memberId = Number(String(raw).replace(/^lc-?/i, '').replace(/\s/g, ''));
    if (!Number.isFinite(memberId) || memberId < 1) {
      return res.status(400).json({ error: 'Geçerli üye numarası gir' });
    }

    if (useRelationalState()) {
      const customer = await runSqlReadFast(() => loadCustomerSummaryRelational(memberId));
      if (!customer) return res.status(404).json({ error: 'Müşteri bulunamadı' });
      return res.status(200).json({ ok: true, customer, via: 'member-id' });
    }

    const remote = await runSqlReadFast(() => loadAppState());
    if (!remote.data) return res.status(404).json({ error: 'Veri bulunamadı' });
    const customer = customerSummary(remote.data, memberId);
    if (!customer) return res.status(404).json({ error: 'Müşteri bulunamadı' });
    return res.status(200).json({ ok: true, customer, via: 'member-id' });
  } catch (error) {
    void logServerError({
      source: 'admin.member-lookup',
      error,
      customerId: null
    });
    return res.status(500).json({ error: publicErrorMessage(error, 'Üye aranamadı') });
  }
}

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

    if (useRelationalState()) {
      // REPLAY KORUMASI nonce claim'i transaction İÇİNDE yapılır (atomik):
      // işlem başarısız olursa nonce de geri alınır, böylece yanlışlıkla
      // "zaten kullanıldı" hatası verip damgayı kaybetmeyiz.
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
    }

    // Legacy (app_state JSON) yol — replay korumasını burada uygula.
    // 90sn'lik token penceresinde aynı (nonce, action) tekrar denenirse 409 döner.
    const claim = await runSql(() => claimQrNonce(getSql(), {
      nonce: verified.nonce,
      action,
      customerId: verified.customerId
    }));
    if (!claim.firstUse) {
      return res.status(409).json({
        error: 'Bu QR kodu bu işlem için zaten kullanıldı. Müşteri ekranı QR\'ı yenilesin.',
        code: 'QR_REPLAY',
        replay: true
      });
    }

    const remote = await runSql(() => loadAppState());
    if (!remote.data) return res.status(404).json({ error: 'Veri bulunamadı' });

    const baseUpdatedAt = remote.updatedAt;
    const nextState = structuredClone(remote.data);
    let result;

    if (action === 'stamp') {
      result = applyCategoryStamp(nextState, verified.customerId, category, count, 'QR kamera', { menuItem });
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
