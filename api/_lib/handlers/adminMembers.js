import { applyCors, publicErrorMessage } from '../http.js';
import { requireAdminSession } from '../auth.js';
import { listAllCustomers } from '../customersStore.js';
import { loadLoyaltyMapFromSql } from '../loyaltyStore.js';
import { getSql } from '../sql.js';
import { runSqlReadFast } from '../runSql.js';
import { isTransientDbError } from '../dbTransient.js';

// Yönetici üye listesi — customers tablosundan doğrudan okuma.
// Auth/PIN kontrolü hızlı 401/403 döner (requireAdminSession light path fail-fast).
// Veri okumaları runSqlReadFast ile sınırlanır: bayat bağlantıda 15sn+ asılı
// kalmaz; geçici DB sorununda 503 ADMIN_MEMBERS_TEMPORARILY_UNAVAILABLE döner.
export async function handleAdminMembers(req, res) {
  applyCors(req, res, 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Auth + admin PIN — oturum yoksa hızlı 401, PIN yoksa hızlı 403
  const admin = await requireAdminSession(req, res, { pinRequired: true, light: true });
  if (!admin) return;

  if (!getSql()) {
    return res.status(503).json({
      ok: false,
      code: 'ADMIN_MEMBERS_TEMPORARILY_UNAVAILABLE',
      error: 'Üye listesi şu an alınamıyor. Lütfen tekrar deneyin.'
    });
  }

  try {
    // Fail-fast okuma — getSql() task içinde çağrılır ki reconnect sonrası taze
    // bağlantı kullanılsın. Transaction pooler'da sorgular sıralı çalışır.
    const customers = await runSqlReadFast(() => listAllCustomers(getSql()));
    const loyalty = await runSqlReadFast(() => loadLoyaltyMapFromSql(getSql()));

    return res.status(200).json({
      ok: true,
      customers,
      loyalty,
      count: customers.length
    });
  } catch (error) {
    // Geçici DB sorunu (bayat bağlantı/timeout) → kontrollü 503
    if (isTransientDbError(error)) {
      return res.status(503).json({
        ok: false,
        code: 'ADMIN_MEMBERS_TEMPORARILY_UNAVAILABLE',
        error: 'Üye listesi şu an alınamıyor. Lütfen tekrar deneyin.'
      });
    }
    // Diğer hatalar — DB iç detayını sızdırma, genel mesaj dön
    return res.status(500).json({
      ok: false,
      code: 'ADMIN_MEMBERS_FAILED',
      error: publicErrorMessage(error, 'Üye listesi alınamadı')
    });
  }
}
