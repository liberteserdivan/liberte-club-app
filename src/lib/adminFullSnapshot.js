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

// Başarılı admin sync sonrası tam state sakla — kısmi liste eski snapshot'ı ezmesin
export function saveAdminSnapshot(data) {
  if (!data || !Array.isArray(data.customers) || data.customers.length < 1) return;

  const previous = loadAdminSnapshot();
  const previousCount = previous?.data?.customers?.length || 0;
  if (previousCount > 0 && data.customers.length < previousCount) return;

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

// Yönetici cihazında eksik üye listesi mi?
export function isPartialAdminCustomerList(db, session) {
  if (!session?.isAdmin || !session?.adminVerified) return false;
  const snap = loadAdminSnapshot();
  const snapCount = snap?.data?.customers?.length || 0;
  const currentCount = (db?.customers || []).length;
  return snapCount >= 1 && currentCount < snapCount;
}

// Soğuk başlangıçta admin snapshot ile db birleştir
export function mergeAdminSnapshotIntoDb(db, session) {
  if (!db || !session?.isAdmin || !session?.adminVerified) return db;
  const snap = loadAdminSnapshot();
  const snapData = snap?.data;
  if (!snapData?.customers?.length) return db;
  if ((db.customers || []).length >= snapData.customers.length) return db;

  return {
    ...db,
    ...snapData,
    settings: { ...db.settings, ...snapData.settings },
    customers: snapData.customers,
    loyalty: { ...(snapData.loyalty || {}), ...(db.loyalty || {}) }
  };
}
