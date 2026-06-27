import { applyCors, publicErrorMessage } from '../http.js';
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

    // Transaction pooler — aynı bağlantıda paralel sorgu kilitlenir
    const customers = await listAllCustomers(sql);
    const loyalty = await loadLoyaltyMapFromSql(sql);

    return res.status(200).json({
      ok: true,
      customers,
      loyalty,
      count: customers.length
    });
  } catch (error) {
    // DB iç detayını sızdırma — genel mesaj dön
    return res.status(500).json({ ok: false, error: publicErrorMessage(error, 'Üye listesi alınamadı') });
  }
}
