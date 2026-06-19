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

// Tekilleştirilmiş apiJson — aynı path için paylaşılan promise
export function dedupedApiJson(path, options = {}) {
  if (isRemoteFetchBlocked()) {
    return Promise.resolve({
      response: { ok: false, status: 0 },
      data: { error: 'Sunucu yanıt vermedi. Biraz sonra tekrar dene.' }
    });
  }

  if (path.startsWith('/api/state') && inflightStateRequest) {
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
      if (path.startsWith('/api/state')) inflightStateRequest = null;
    });

  if (path.startsWith('/api/state')) inflightStateRequest = request;
  return request;
}
