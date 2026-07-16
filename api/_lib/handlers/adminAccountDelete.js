import { applyCors, publicErrorMessage } from '../http.js';
import { destroySession, requireSession } from '../auth.js';
import { loadAppState, saveAppState } from '../appState.js';
import { deleteCustomerFromState } from '../stateAccess.js';
import { purgeCustomerAuthRecords, purgeCustomerRelational } from '../accountCleanup.js';
import { useRelationalState } from '../relationalConfig.js';
import { getSql } from '../sql.js';
import { findCustomerById } from '../customersStore.js';
import { bumpAppStateRevision } from '../relationalState.js';
import { invalidateAppStateCache } from '../appStateCache.js';

// Relational modda kendi hesabını gerçek DB silme ile kaldır
async function deleteAccountRelational(req, res, session) {
  const sql = getSql();
  if (!sql) {
    return res.status(503).json({ error: 'Veritabanı yapılandırması eksik' });
  }

  const customer = await findCustomerById(sql, session.customerId);
  if (!customer) return res.status(404).json({ error: 'Hesap bulunamadı' });

  // Son yönetici hesabı silinemez — DB'den canlı sayım
  if (customer.isAdmin) {
    const rows = await sql`SELECT count(*)::int AS count FROM customers WHERE is_admin = true`;
    if (Number(rows[0]?.count || 0) <= 1) {
      return res.status(403).json({ error: 'Son yönetici hesabı silinemez' });
    }
  }

  await purgeCustomerRelational({
    customerId: session.customerId,
    phone: customer.phone,
    email: customer.email
  }, sql);

  await bumpAppStateRevision(sql);
  invalidateAppStateCache();
  await destroySession(req, res);

  return res.status(200).json({ ok: true });
}

// Hesap silme — App Store uyumu
export async function handleAdminAccountDelete(req, res) {
  applyCors(req, res, 'POST,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await requireSession(req, res);
    if (!session) return;

    // Relational modda app_state JSON yazımı satırı silmez → gerçek purge kullan
    if (useRelationalState()) {
      return await deleteAccountRelational(req, res, session);
    }

    const remote = await loadAppState();
    if (!remote.data) return res.status(404).json({ error: 'Veri bulunamadı' });

    const customer = (remote.data.customers || []).find(
      (c) => Number(c.id) === Number(session.customerId)
    );
    if (!customer) return res.status(404).json({ error: 'Hesap bulunamadı' });

    if (customer.isAdmin) {
      const adminCount = (remote.data.customers || []).filter((c) => c.isAdmin).length;
      if (adminCount <= 1) {
        return res.status(403).json({ error: 'Son yönetici hesabı silinemez' });
      }
    }

    const next = deleteCustomerFromState(remote.data, session.customerId);
    next.history = [
      {
        id: Date.now(),
        customerId: session.customerId,
        type: 'customer_delete',
        count: 0,
        source: 'Kullanıcı hesap silme',
        createdAt: new Date().toLocaleString('tr-TR')
      },
      ...(next.history || [])
    ];

    await saveAppState(next);
    await purgeCustomerAuthRecords({
      customerId: session.customerId,
      phone: customer.phone,
      email: customer.email
    });
    await destroySession(req, res);

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: publicErrorMessage(e, 'Hesap silinemedi') });
  }
}
