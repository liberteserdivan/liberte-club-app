import { applyCors } from '../http.js';
import { requireSession, requireAdminSession, getSessionForBootstrap } from '../auth.js';
import { loadLoyaltyForCustomer, loadHistoryFromSql, loadLoyaltyMapFromSql } from '../loyaltyStore.js';
import { listAllCustomers } from '../customersStore.js';
import { listInAppNotificationsForCustomer } from '../inAppNotificationStore.js';
import { getSql, resetSqlClient } from '../sql.js';
import { withSqlRetry } from '../dbTransient.js';

// Kampanya/kupon dilimini state'ten oku
function readPromoSlice(state) {
  return {
    campaigns: state?.campaigns || [],
    coupons: (state?.coupons || []).filter((row) => row?.active !== false),
    dailyCampaign: state?.dailyCampaign || null
  };
}

// Relational modda promos — app_state global diliminden
async function loadPromoSlice() {
  const { loadAppState } = await import('../appState.js');
  const remote = await loadAppState();
  return readPromoSlice(remote.data || {});
}

// Müşteri loyalty + son işlemler — Realtime tetikleyici sonrası hafif fetch
async function handleCustomerLoyalty(req, res, session) {
  const loyalty = await withSqlRetry(async () => {
    const sql = getSql();
    if (!sql) throw new Error('Veritabanı yapılandırması eksik');
    return loadLoyaltyForCustomer(session.customerId, sql);
  }, { resetClient: resetSqlClient });

  return res.status(200).json({
    ok: true,
    customerId: session.customerId,
    loyalty: loyalty || null
  });
}

// Müşteri LP geçmişi — son N kayıt
async function handleCustomerHistory(req, res, session) {
  const sql = getSql();
  if (!sql) return res.status(503).json({ ok: false, error: 'Veritabanı yapılandırması eksik' });

  const limit = Math.min(Math.max(Number(req.query?.limit) || 20, 1), 50);
  const allHistory = await loadHistoryFromSql(sql, session.customerId);
  return res.status(200).json({
    ok: true,
    customerId: session.customerId,
    history: allHistory.slice(0, limit)
  });
}

// Uygulama içi bildirimler
async function handleCustomerNotifications(req, res, session) {
  const sql = getSql();
  if (!sql) return res.status(503).json({ ok: false, error: 'Veritabanı yapılandırması eksik' });

  const rows = await listInAppNotificationsForCustomer(sql, session.customerId, 30);
  return res.status(200).json({ ok: true, notifications: rows });
}

// Kampanya/kupon yenileme dilimi
async function handlePromos(req, res) {
  const promos = await loadPromoSlice();
  return res.status(200).json({ ok: true, ...promos });
}

// Admin üye listesi — doğrudan customers tablosu (hızlı, güvenilir)
async function handleAdminCustomers(req, res) {
  const sql = getSql();
  if (!sql) return res.status(503).json({ ok: false, error: 'Veritabanı yapılandırması eksik' });

  const customers = await listAllCustomers(sql);
  const loyalty = await loadLoyaltyMapFromSql(sql);

  return res.status(200).json({
    ok: true,
    customers,
    loyalty,
    count: customers.length
  });
}

// Admin özet feed — son işlemler + üye sayısı
async function handleAdminFeed(req, res) {
  const sql = getSql();
  if (!sql) return res.status(503).json({ ok: false, error: 'Veritabanı yapılandırması eksik' });

  const events = await sql`
      SELECT id, customer_id, event_type, category, delta, note, created_at
      FROM loyalty_events
      ORDER BY id DESC
      LIMIT 20
    `.catch(() => []);
  const customers = await sql`SELECT count(*)::int AS c FROM customers`.catch(() => [{ c: 0 }]);
  const pushDevices = await sql`
      SELECT count(*)::int AS c
      FROM push_subscriptions
      WHERE active = true AND revoked_at IS NULL
    `.catch(() => [{ c: 0 }]);
  const pushLog = await sql`
      SELECT id, title, sent, failed, created_at
      FROM push_send_log
      ORDER BY id DESC
      LIMIT 5
    `.catch(() => []);

  return res.status(200).json({
    ok: true,
    customerCount: Number(customers[0]?.c || 0),
    pushDeviceCount: Number(pushDevices[0]?.c || 0),
    recentEvents: events || [],
    recentPushLog: pushLog || []
  });
}

// Realtime sonrası hafif veri fetch — kritik işlem burada yapılmaz
export async function handleRealtimeFetch(req, res) {
  applyCors(req, res, 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const resource = String(req.query?.resource || '').trim().toLowerCase();

  try {
    if (resource === 'promos') {
      const session = await requireSession(req, res);
      if (!session) return;
      return handlePromos(req, res);
    }

    if (resource === 'admin-feed') {
      const admin = await requireAdminSession(req, res, { pinRequired: true, light: true });
      if (!admin) return;
      return handleAdminFeed(req, res);
    }

    if (resource === 'admin-customers') {
      const admin = await requireAdminSession(req, res, { pinRequired: true, light: true });
      if (!admin) return;
      return handleAdminCustomers(req, res);
    }

    const session = await getSessionForBootstrap(req);
    if (!session?.customerId) {
      return res.status(401).json({ error: 'Oturum gerekli' });
    }

    if (resource === 'customer-loyalty') return handleCustomerLoyalty(req, res, session);
    if (resource === 'customer-history') return handleCustomerHistory(req, res, session);
    if (resource === 'customer-notifications') return handleCustomerNotifications(req, res, session);

    return res.status(400).json({
      error: 'resource gerekli: customer-loyalty, customer-history, customer-notifications, promos, admin-feed, admin-customers'
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Realtime fetch başarısız' });
  }
}
