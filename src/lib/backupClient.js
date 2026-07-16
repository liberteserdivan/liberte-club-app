// Yedekleme API istemcisi — admin tarafı indir/listele/geri yükle
import { apiFetch, apiJson } from './apiClient.js';

// Yanıttan hata mesajını güvenli çıkar
function errorFrom(data, response, fallback) {
  return data?.error || (response.ok ? '' : fallback) || fallback;
}

import { loadAdminSnapshot } from './adminFullSnapshot.js';

// JSON dosyasını indir
function saveJsonDownload(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// Tam yedeği sunucudan indir ve JSON dosyası olarak kaydet
export async function downloadBackup() {
  const response = await apiFetch('/api/backup');
  const text = await response.text();
  if (!response.ok) {
    let message = 'Yedek indirilemedi.';
    try { message = JSON.parse(text).error || message; } catch { /* yoksay */ }
    throw new Error(message);
  }

  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  saveJsonDownload(JSON.parse(text), `liberte-yedek-${stamp}.json`);
}

// Sunucu erişilemezken — bellekteki/önbellekteki veriyi indir
export function downloadLocalBackup(db) {
  if (!db || !Array.isArray(db.customers)) {
    throw new Error('Önbellekte yedeklenecek veri yok.');
  }

  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  saveJsonDownload({
    exportedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: 'local-cache',
    data: db
  }, `liberte-onbellek-yedek-${stamp}.json`);
}

// Son başarılı admin sync anlık görüntüsünü indir (tüm üyeler)
export function downloadAdminSnapshotBackup() {
  const snapshot = loadAdminSnapshot();
  if (!snapshot?.data?.customers?.length) {
    throw new Error('Tam yönetici yedeği yok. Sunucu açıkken admin olarak bir kez giriş yapıp senkron olması gerekir.');
  }

  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  saveJsonDownload({
    exportedAt: new Date().toISOString(),
    updatedAt: snapshot.savedAt || new Date().toISOString(),
    source: 'admin-snapshot',
    customerCount: snapshot.customerCount,
    data: snapshot.data
  }, `liberte-tam-yedek-${stamp}.json`);
}

// Sunucudaki anlık yedek listesini getir
export async function fetchBackupList() {
  const { response, data } = await apiJson('/api/backup?list=1');
  if (!response.ok) throw new Error(errorFrom(data, response, 'Yedek listesi alınamadı.'));
  return data.backups || [];
}

// Seçili anlık yedeği geri yükle
export async function restoreBackupSnapshot(snapshotId) {
  const { response, data } = await apiJson('/api/backup', {
    method: 'POST',
    body: JSON.stringify({ snapshotId })
  });
  if (!response.ok) throw new Error(errorFrom(data, response, 'Geri yükleme başarısız.'));
  return true;
}

// İndirilen JSON dosyasından geri yükle
export async function restoreBackupFile(file) {
  const raw = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Dosya geçerli bir JSON değil.');
  }

  // Dosya ya tam export ({data:{...}}) ya da doğrudan state olabilir
  const payload = parsed?.data && Array.isArray(parsed.data.customers) ? parsed.data : parsed;
  const { response, data } = await apiJson('/api/backup', {
    method: 'POST',
    body: JSON.stringify({ data: payload })
  });
  if (!response.ok) throw new Error(errorFrom(data, response, 'Geri yükleme başarısız.'));
  return true;
}
