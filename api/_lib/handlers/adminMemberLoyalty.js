import { applyCors, readBodySafe } from '../http.js';
import { requireAdminSession } from '../auth.js';
import { applyLoyaltyActionRelational } from '../loyaltyStore.js';
import { loadMenuFromSql } from '../menuStore.js';
import { getSql } from '../sql.js';
import { logServerError } from '../logServerError.js';
import { publicErrorMessage } from '../http.js';

// Menü ürününü id ile bul
async function findMenuItemById(menuItemId) {
  const id = Number(menuItemId);
  if (!id) return null;

  const sql = getSql();
  if (!sql) return null;

  const menu = await loadMenuFromSql(sql);
  return (menu.items || []).find((row) => Number(row.id) === id) || null;
}

// Admin panel — manuel LP / ikram işlemi (tam state yazımı yok)
export async function handleAdminMemberLoyalty(req, res) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = await requireAdminSession(req, res);
  if (!session) return;

  try {
    const body = readBodySafe(req);
    const customerId = Number(body.customerId);
    const action = String(body.action || 'stamp').trim();
    const category = String(body.category || 'coffee').trim();
    const count = Math.max(1, Math.min(10, Math.trunc(Number(body.count ?? 1) || 1)));
    const menuItem = body.menuItemId != null
      ? await findMenuItemById(body.menuItemId)
      : null;

    if (!customerId) {
      return res.status(400).json({ ok: false, error: 'customerId zorunlu' });
    }

    // Çift tıklama / yeniden deneme — Idempotency-Key TX içinde claim edilir
    const idempotencyKey = String(
      req.headers?.['idempotency-key'] || body.idempotencyKey || ''
    ).trim().slice(0, 120);

    const result = await applyLoyaltyActionRelational({
      customerId,
      action,
      category,
      menuItem,
      count,
      note: String(body.note || 'Admin manuel').trim() || 'Admin manuel',
      nonce: idempotencyKey || null
    });

    if (result.replay) {
      return res.status(409).json({
        ok: false,
        error: result.error || 'Bu istek zaten işlendi',
        code: 'IDEMPOTENCY_REPLAY',
        replay: true
      });
    }

    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.error || 'LP işlemi yapılamadı' });
    }

    return res.status(200).json({
      ok: true,
      customerId,
      customer: result.customer || null,
      loyalty: result.loyalty || null
    });
  } catch (error) {
    await logServerError({
      source: 'admin.member-loyalty',
      error,
      customerId: session?.customerId || null
    });
    return res.status(500).json({ ok: false, error: publicErrorMessage(error, 'LP işlemi başarısız') });
  }
}
