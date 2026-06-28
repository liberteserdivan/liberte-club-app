import { apiJson, SYNC_REQUEST_OPTIONS } from './apiClient.js';

// Eşzamanlı /api/state isteklerini tekilleştir
let inflightStateRequest = null;

// Hata sonrası üstel backoff — sonsuz retry önlenir
let failStreak = 0;
let blockedUntil = 0;
const BACKOFF_BASE_MS = 3000;
const BACKOFF_MAX_MS = 30_000;

function computeBackoffMs() {
  return Math.min(BACKOFF_BASE_MS * Math.max(1, failStreak), BACKOFF_MAX_MS);
}

// Backoff aktif mi?
export function isRemoteFetchBlocked() {
  return Date.now() < blockedUntil;
}

// Kalan backoff süresi (sn)
export function remoteFetchBlockedSeconds() {
  if (!isRemoteFetchBlocked()) return 0;
  return Math.max(1, Math.ceil((blockedUntil - Date.now()) / 1000));
}

// Başarılı istek — backoff sıfırla
export function markRemoteFetchSuccess() {
  failStreak = 0;
  blockedUntil = 0;
}

// Başarısız istek — backoff uygula
export function markRemoteFetchFailure() {
  failStreak += 1;
  blockedUntil = Date.now() + computeBackoffMs();
}

// Oturum geçişlerinde (logout/login) modül seviyesindeki ağ durumunu sıfırla.
// Aksi halde önceki oturumdan kalan backoff (blockedUntil) yeni girişte /api/state
// isteğini gereksizce reddeder ve eski in-flight GET yeni oturumun verisini ezebilir.
export function resetRemoteFetchState() {
  inflightStateRequest = null;
  failStreak = 0;
  blockedUntil = 0;
}

// Yalnızca okuma (GET) /api/state istekleri tekilleştirilir. POST (kaydet) isteğini
// aynı path'teki in-flight GET'e bağlamak kaydı yutardı; bu yüzden GET'e sınırlıdır.
function isDedupableStateRead(path, options) {
  if (!path.startsWith('/api/state')) return false;
  const method = String(options.method || 'GET').toUpperCase();
  return method === 'GET';
}

// Tekilleştirilmiş apiJson — aynı GET /api/state için paylaşılan promise
export function dedupedApiJson(path, options = {}) {
  if (isRemoteFetchBlocked()) {
    const seconds = remoteFetchBlockedSeconds();
    const err = new Error(`Sunucu geçici olarak meşgul. ${seconds} sn sonra tekrar dene.`);
    err.code = 'REMOTE_BACKOFF';
    return Promise.reject(err);
  }

  const dedupable = isDedupableStateRead(path, options);
  if (dedupable && inflightStateRequest) {
    return inflightStateRequest;
  }

  const request = apiJson(path, { ...SYNC_REQUEST_OPTIONS, ...options })
    .then((result) => {
      if (result.response.ok) markRemoteFetchSuccess();
      else if (result.response.status >= 500 || result.response.status === 0) markRemoteFetchFailure();
      return result;
    })
    .catch((error) => {
      markRemoteFetchFailure();
      throw error;
    })
    .finally(() => {
      if (dedupable) inflightStateRequest = null;
    });

  if (dedupable) inflightStateRequest = request;
  return request;
}
