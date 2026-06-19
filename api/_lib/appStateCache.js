// Sunucu tarafı kısa süreli app_state önbelleği — aynı invocation içinde tekrar SELECT azaltır

const CACHE_TTL_MS = 20_000;

let cache = null;

// Önbellekten oku — süresi dolmuşsa null
export function readAppStateCache() {
  if (!cache) return null;
  if (Date.now() - cache.fetchedAt > CACHE_TTL_MS) {
    cache = null;
    return null;
  }
  return cache;
}

// Önbelleğe yaz
export function writeAppStateCache(data, updatedAt) {
  if (!data) return;
  cache = {
    data,
    updatedAt: updatedAt ?? null,
    fetchedAt: Date.now()
  };
}

// Yazım sonrası önbelleği temizle
export function invalidateAppStateCache() {
  cache = null;
}
