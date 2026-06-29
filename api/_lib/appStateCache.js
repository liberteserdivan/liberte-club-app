// Sunucu tarafı kısa süreli app_state önbelleği — tam state ile üye dilimini ayır

// B-5: Çok-instanslı dağıtımda bir instance'taki yazı diğerinin önbelleğini
// temizlemez. Bayatlık penceresini sınırlamak için TTL düşürüldü (20s → 10s).
// Değişiklik sinyali (loadAppStateRevision) zaten her zaman DB'den okunur.
const CACHE_TTL_MS = 10_000;

let fullCache = null;
const customerCaches = new Map();

// Önbellek girdisinin süresi dolmuş mu
function isExpired(entry) {
  if (!entry) return true;
  return Date.now() - entry.fetchedAt > CACHE_TTL_MS;
}

// Tam state önbelleğini oku
export function readAppStateCache() {
  if (isExpired(fullCache)) {
    fullCache = null;
    return null;
  }
  return fullCache;
}

// Üye dilimi önbelleğini oku
export function readAppStateCacheForCustomer(customerId) {
  const id = Number(customerId);
  if (!id) return null;
  const entry = customerCaches.get(id);
  if (isExpired(entry)) {
    customerCaches.delete(id);
    return null;
  }
  return entry;
}

// Tam state önbelleğine yaz
export function writeAppStateCache(data, updatedAt) {
  if (!data) return;
  fullCache = {
    data,
    updatedAt: updatedAt ?? null,
    fetchedAt: Date.now()
  };
}

// Üye dilimi önbelleğine yaz — admin tam listesini ezmesin
export function writeAppStateCacheForCustomer(customerId, data, updatedAt) {
  const id = Number(customerId);
  if (!id || !data) return;
  customerCaches.set(id, {
    data,
    updatedAt: updatedAt ?? null,
    fetchedAt: Date.now()
  });
}

// Yazım sonrası tüm önbelleği temizle
export function invalidateAppStateCache() {
  fullCache = null;
  customerCaches.clear();
}
