import { applyCors } from '../http.js';
import { requireAdminSession } from '../auth.js';
import { listAllCustomers } from '../customersStore.js';
import { loadLoyaltyMapFromSql } from '../loyaltyStore.js';
import { getSql } from '../sql.js';

// Yönetici üye listesi — customers tablosundan doğrudan okuma
export async function handleAdminMembers(req, res) {
  applyCors(req, res, 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const admin = await requireAdminSession(req, res, { pinRequired: true, light: true });
    if (!admin) return;

    const sql = getSql();
    if (!sql) {
      return res.status(503).json({ ok: false, error: 'Veritabanı yapılandırması eksik' });
    }

    const [customers, loyalty] = await Promise.all([
      listAllCustomers(sql),
      loadLoyaltyMapFromSql(sql)
    ]);

    return res.status(200).json({
      ok: true,
      customers,
      loyalty,
      count: customers.length
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Üye listesi alınamadı' });
  }
}
