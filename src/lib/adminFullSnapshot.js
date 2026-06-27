// Yönetici tam veri anlık görüntüsü — sunucu kapalıyken yedek için
const ADMIN_SNAPSHOT_KEY = 'liberteAdminSnapshot';

// PII'yi sınırlamak için snapshot ömrü — süresi geçince silinir (paylaşılan cihaz riski)
const SNAPSHOT_TTL_MS = 30 * 60 * 1000;

// Snapshot'ta tutulacak güvenli/minimal alanlar — token/feedback gibi hassas
// listeler KASITLI olarak dışarıda bırakılır (PII yüzeyini küçültür)
const SNAPSHOT_DATA_KEYS = ['settings', 'customers', 'loyalty', 'categories', 'items'];

// Snapshot verisini minimal alanlara indir
function minimizeSnapshotData(data) {
  const slim = {};
  for (const key of SNAPSHOT_DATA_KEYS) {
    if (data[key] != null) slim[key] = data[key];
  }
  return slim;
}

// Snapshot süresi doldu mu
function isSnapshotExpired(parsed) {
  const savedAt = Date.parse(parsed?.savedAt || '');
  if (!savedAt) return true;
  return Date.now() - savedAt > SNAPSHOT_TTL_MS;
}

// Tam state'i güvenli şekilde oku — süresi dolmuşsa temizle ve null dön
export function loadAdminSnapshot() {
  try {
    const raw = localStorage.getItem(ADMIN_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.data || !Array.isArray(parsed.data.customers)) return null;
    if (isSnapshotExpired(parsed)) {
      clearAdminSnapshot();
      return null;
    }
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
      data: minimizeSnapshotData(data)
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
