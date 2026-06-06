import { applyCors, readBody } from './lib/http.js';
import { requireAdminSession } from './lib/auth.js';
import { loadAppState, saveAppState, listBackups, restoreBackup } from './lib/appState.js';

// Veri yedekleme — yalnızca PIN doğrulanmış yönetici erişebilir
export default async function handler(req, res) {
  applyCors(req, res, 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Tüm yedek işlemleri admin + adminVerified gerektirir
  const session = await requireAdminSession(req, res, { pinRequired: true });
  if (!session) return;

  try {
    if (req.method === 'GET') return await handleGet(req, res);
    if (req.method === 'POST') return await handleRestore(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Yedek işlemi başarısız' });
  }
}

// GET — yedek listesini ya da indirilebilir tam yedeği döndür
async function handleGet(req, res) {
  if (req.query?.list) {
    const backups = await listBackups(50);
    return res.status(200).json({ ok: true, backups });
  }

  const { data, updatedAt } = await loadAppState();
  if (!data) return res.status(404).json({ error: 'Yedeklenecek veri bulunamadı' });

  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  res.setHeader('Content-Disposition', `attachment; filename="liberte-yedek-${stamp}.json"`);
  return res.status(200).json({ exportedAt: new Date().toISOString(), updatedAt, data });
}

// POST — anlık yedekten ya da yüklenen JSON'dan geri yükle
async function handleRestore(req, res) {
  const body = readBody(req);

  // 1) Sunucudaki anlık yedekten geri yükleme
  if (body.snapshotId != null) {
    const ok = await restoreBackup(Number(body.snapshotId));
    if (!ok) return res.status(404).json({ error: 'Yedek bulunamadı' });
    return res.status(200).json({ ok: true, restored: 'snapshot' });
  }

  // 2) İndirilen JSON dosyasından geri yükleme
  const data = body.data;
  if (!data || typeof data !== 'object' || !Array.isArray(data.customers)) {
    return res.status(400).json({ error: 'Geçersiz yedek dosyası' });
  }

  await saveAppState(data);
  return res.status(200).json({ ok: true, restored: 'file' });
}
