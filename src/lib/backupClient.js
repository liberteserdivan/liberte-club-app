// Yedekleme API istemcisi — admin tarafı indir/listele/geri yükle
import { apiFetch, apiJson } from './apiClient.js';

// Yanıttan hata mesajını güvenli çıkar
function errorFrom(data, response, fallback) {
  return data?.error || (response.ok ? '' : fallback) || fallback;
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

  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const link = document.createElement('a');
  link.href = url;
  link.download = `liberte-yedek-${stamp}.json`;
  link.click();
  URL.revokeObjectURL(url);
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
