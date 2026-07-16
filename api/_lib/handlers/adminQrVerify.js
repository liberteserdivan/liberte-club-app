import { applyCors, publicErrorMessage, readBodySafe } from '../http.js';
import { requireAdminSession } from '../auth.js';
import { verifyCustomerQrToken } from '../qrToken.js';
import { logServerError } from '../logServerError.js';
import { useRelationalState } from '../relationalConfig.js';
import {
  findCustomerById,
  findLoyaltyByCustomerId,
  loyaltyRowToCard
} from '../customersStore.js';
import { migrateLoyaltyCard } from '../loyaltyPointsServer.js';
import { getMembershipView } from '../../../src/lib/membershipTier.js';
import { getSql } from '../sql.js';
import { runSql } from '../runSql.js';
import { loadAppState } from '../appState.js';

// QR/kasiyer için hafif özet
function buildCashierCustomerSummary(customer, loyaltySource) {
  if (!customer?.id) return null;
  const id = Number(customer.id);

  let loyalty = null;
  if (loyaltySource && (
    loyaltySource.lp_balance != null
    || loyaltySource.lp_lifetime != null
    || loyaltySource.legacy_json
    || loyaltySource.customer_id != null
  )) {
    loyalty = loyaltyRowToCard(loyaltySource, id);
  } else if (loyaltySource && (
    loyaltySource.lpBalance != null
    || loyaltySource.schemaVersion != null
  )) {
    loyalty = migrateLoyaltyCard({ ...loyaltySource, customerId: id });
  } else {
    loyalty = migrateLoyaltyCard({
      customerId: id,
      schemaVersion: 2,
      lpBalance: 0,
      lpLifetime: 0,
      level: 'Bronze'
    });
  }

  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email || '',
    birthDate: customer.birthDate || '',
    loyalty,
    membership: getMembershipView(loyalty, customer, [])
  };
}

async function loadCashierCustomerSummary(customerId) {
  const sql = getSql();
  if (!sql) return null;
  const id = Number(customerId);

  // Cutover sonrası app_state'te customers olmayabilir — önce normalize tablo
  const [customer, loyaltyRow] = await Promise.all([
    findCustomerById(sql, id),
    findLoyaltyByCustomerId(sql, id)
  ]);
  if (customer) {
    return buildCashierCustomerSummary(customer, loyaltyRow);
  }

  if (useRelationalState()) return null;

  const remote = await loadAppState();
  if (!remote?.data) return null;
  const fromState = (remote.data.customers || []).find((row) => Number(row.id) === id);
  if (!fromState) return null;
  const loyalty = remote.data.loyalty?.[id] || remote.data.loyalty?.[String(id)] || null;
  return buildCashierCustomerSummary(fromState, loyalty);
}

// Kasiyer QR doğrula — LP action / menuSeed yolundan ayrı
export async function handleAdminQrVerify(req, res) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const session = await requireAdminSession(req, res, { light: true });
    if (!session) return;

    const body = readBodySafe(req);
    const verified = verifyCustomerQrToken(body.token, { allowExpired: true });
    if (!verified.ok) {
      return res.status(400).json({
        error: verified.error,
        expired: Boolean(verified.expired)
      });
    }

    const customer = await runSql(() => loadCashierCustomerSummary(verified.customerId));
    if (!customer) {
      return res.status(404).json({ error: 'Müşteri bulunamadı' });
    }

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

// Üye no / LC- ile kart aç
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

    const customer = await runSql(() => loadCashierCustomerSummary(memberId));
    if (!customer) {
      return res.status(404).json({ error: 'Müşteri bulunamadı' });
    }

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
