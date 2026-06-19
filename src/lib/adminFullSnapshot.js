// Yönetici tam veri anlık görüntüsü — sunucu kapalıyken yedek için
const ADMIN_SNAPSHOT_KEY = 'liberteAdminSnapshot';

// Tam state'i güvenli şekilde oku
export function loadAdminSnapshot() {
  try {
    const raw = localStorage.getItem(ADMIN_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.data || !Array.isArray(parsed.data.customers)) return null;
    return parsed;
  } catch {
    return null;
  }
}

// Başarılı admin sync sonrası tam state sakla
export function saveAdminSnapshot(data) {
  if (!data || !Array.isArray(data.customers) || data.customers.length < 2) return;

  try {
    const payload = {
      savedAt: new Date().toISOString(),
      customerCount: data.customers.length,
      data
    };
    localStorage.setItem(ADMIN_SNAPSHOT_KEY, JSON.stringify(payload));
  } catch {
    // Quota aşımında sessizce geç
  }
}

// Anlık görüntüyü temizle
export function clearAdminSnapshot() {
  try {
    localStorage.removeItem(ADMIN_SNAPSHOT_KEY);
  } catch {
    // yoksay
  }
}
