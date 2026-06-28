import { formatClientApiError } from './apiErrors.js';
import { isNativeApp, isIos, isAndroid } from './platform.js';
import { recordRequest } from './guardianTelemetry.js';
import { applySafeModeHeader, isSafeModeEnabled } from './safeMode.js';

const TOKEN_KEY = 'liberteAuthToken';
// Temizlenmesi gereken eski/legacy token anahtarları — çıkışta hepsi silinir
const LEGACY_TOKEN_KEYS = [TOKEN_KEY, 'liberteNativeAuthToken', 'liberteSessionToken'];
const NATIVE_API_ORIGIN = 'https://app.liberte.cafe';

// Web'de token kalıcı depoya YAZILMAZ; yalnızca bellekte tutulur (httpOnly cookie
// kalıcılığı sağlar). Bu, XSS ile token çalınması yüzeyini küçültür.
let memoryAuthToken = '';

let onUnauthorized = null;

export function setUnauthorizedHandler(handler) {
  onUnauthorized = typeof handler === 'function' ? handler : null;
}

// İstek yolunu tam URL'ye çevir
function resolveApiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  if (isNativeApp()) {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return `${NATIVE_API_ORIGIN}${normalized}`;
  }
  return path;
}

// Oturum tokenını sakla.
// - Native (Capacitor): cross-origin istekte cookie gitmediği için Bearer şart →
//   kalıcı depoya yazılır.
// - Web: yalnızca bellekte tutulur; httpOnly cookie kalıcılığı sağlar, token
//   localStorage/sessionStorage'a YAZILMAZ (XSS hırsızlık yüzeyini küçültür).
export function saveAuthToken(token) {
  if (!token) return;
  memoryAuthToken = token;

  if (!isNativeApp()) return;

  try {
    sessionStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Sessizce geç
  }
}

// Geriye uyumluluk
export function saveNativeAuthToken(token) {
  saveAuthToken(token);
}

export function clearNativeAuthToken() {
  memoryAuthToken = '';
  try {
    // Tüm eski/legacy token anahtarlarını her iki depodan da temizle
    for (const key of LEGACY_TOKEN_KEYS) {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    }
  } catch {
    // Sessizce geç
  }
}

// Saklanan oturum tokenı var mı — QR debug için
export function hasStoredAuthToken() {
  return Boolean(readStoredAuthToken());
}

// Debug — token uzunluğu (gizli tutulur)
export function getStoredAuthTokenMeta() {
  const token = readStoredAuthToken();
  return {
    exists: Boolean(token),
    length: token.length,
    prefix: token ? `${token.slice(0, 6)}…` : null
  };
}

function readStoredAuthToken() {
  // Önce bellek (web + native her ikisinde de geçerli)
  if (memoryAuthToken) return memoryAuthToken;
  // Web'de kalıcı depo OKUNMAZ — cookie tabanlı oturum kullanılır
  if (!isNativeApp()) return '';
  try {
    return sessionStorage.getItem(TOKEN_KEY)
      || localStorage.getItem(TOKEN_KEY)
      || '';
  } catch {
    return '';
  }
}

// Saklanan ham oturum tokenı — çıkışta sunucuya açık header ile göndermek için
export function getStoredAuthToken() {
  return readStoredAuthToken();
}

const FETCH_TIMEOUT_MS = 12000;
const NATIVE_FETCH_TIMEOUT_MS = 25000;
const AUTH_FETCH_TIMEOUT_MS = 25000;
const NATIVE_AUTH_FETCH_TIMEOUT_MS = 40000;

function resolveFetchTimeout(timeoutMs) {
  if (Number(timeoutMs) > 0) return Number(timeoutMs);
  if (isNativeApp()) {
    return isIos() ? NATIVE_FETCH_TIMEOUT_MS : 20000;
  }
  return FETCH_TIMEOUT_MS;
}

function isNativeNetworkFailure(error) {
  if (!error) return false;
  if (error?.code === 'FETCH_TIMEOUT') return true;
  const message = String(error?.message || '').toLowerCase();
  return message === 'failed to fetch'
    || message === 'load failed'
    || message.includes('network request failed')
    || message.includes('the internet connection appears to be offline');
}

// İstek süresini ölç — hata ayıklama için
function withRequestMeta(path, startedAt, data = {}) {
  return {
    ...data,
    _meta: {
      path,
      durationMs: Date.now() - startedAt
    }
  };
}

// Zaman aşımı hatası üret
function makeTimeoutError() {
  const timeoutErr = new Error('Sunucuya ulaşılamadı.');
  timeoutErr.code = 'FETCH_TIMEOUT';
  return timeoutErr;
}

// Android (Capacitor) fetch — patched fetch + AbortController sinyali POST
// isteğinde promise'i hiç settle etmeyebiliyor (sonsuz bekleme/spinner).
// Bu yüzden sinyal GEÇMEYİZ; zaman aşımını Promise.race ile garanti ederiz.
// Böylece istek ya başarılı döner ya net bir hatayla biter, asla asılı kalmaz.
// iOS sorunsuz çalıştığı için AbortController yolunda bırakılır.
function nativeFetchWithTimeout(url, rest, timeoutMs) {
  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(makeTimeoutError()), timeoutMs);
  });
  const fetchPromise = fetch(url, rest);
  return Promise.race([fetchPromise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

// Web fetch — AbortController ile gerçek iptal
function webFetchWithTimeout(url, rest, userSignal, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  if (userSignal) {
    if (userSignal.aborted) {
      controller.abort();
    } else {
      userSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  return fetch(url, { ...rest, signal: controller.signal })
    .finally(() => clearTimeout(timer))
    .catch((error) => {
      if (error?.name !== 'AbortError') throw error;
      if (timedOut) throw makeTimeoutError();
      const abortErr = new Error('İstek iptal edildi.');
      abortErr.name = 'AbortError';
      throw abortErr;
    });
}

// Fetch isteğine üst zaman sınırı ekle — platforma göre güvenli strateji
function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const { signal: userSignal, ...rest } = options;
  // Sorun yalnızca Android'de görüldü; iOS/web çalışan AbortController yolunda kalır
  if (isNativeApp() && isAndroid()) {
    return nativeFetchWithTimeout(url, rest, timeoutMs);
  }
  return webFetchWithTimeout(url, rest, userSignal, timeoutMs);
}

// HTTP metodu idempotent mi — yalnızca güvenli metotlar otomatik tekrar denenir
function isIdempotentMethod(method) {
  const verb = String(method || 'GET').toUpperCase();
  return verb === 'GET' || verb === 'HEAD';
}

// Hata, bayat bağlantı/soğuk başlatma kaynaklı geçici bir hata mı?
// (Vercel donmuş instance'ında ilk istek pooler bağlantısı bayatsa zaman aşımına uğrar.)
function isRetryableTransport(error) {
  return error?.code === 'FETCH_TIMEOUT' || error?.code === 'NETWORK_ERROR';
}

// Geçici hata sonrası kısa gecikme — yeniden bağlanan instance'a düşme şansını artırır
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Tek bir ağ isteğini gerçekleştir — token, header ve zaman aşımı uygular
async function performApiFetch(url, fetchOptions, headers, native, requestTimeout, skipUnauthorized) {
  try {
    const response = await fetchWithTimeout(url, {
      ...fetchOptions,
      headers,
      credentials: native ? 'omit' : 'include'
    }, requestTimeout);

    if (response.status === 401 && onUnauthorized && !skipUnauthorized) {
      onUnauthorized('expired');
    }

    return response;
  } catch (error) {
    if (error?.name === 'AbortError' || error?.code === 'FETCH_TIMEOUT') throw error;
    if (native && isNativeNetworkFailure(error)) {
      const netErr = new Error('Sunucuya bağlanılamadı. İnternet bağlantını kontrol et.');
      netErr.code = 'NETWORK_ERROR';
      throw netErr;
    }
    throw error;
  }
}

// Kimlik bilgili API isteği — idempotent isteklerde geçici hatada bir kez tekrar dener
export async function apiFetch(path, options = {}) {
  const { timeoutMs, skipUnauthorized = false, retryTransient, ...fetchOptions } = options;
  const headers = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers || {})
  };

  const token = readStoredAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const native = isNativeApp();
  const url = resolveApiUrl(path);
  const requestTimeout = resolveFetchTimeout(timeoutMs);

  // Yalnızca güvenli (idempotent) isteklerde otomatik tekrar — çift POST riski yok.
  // retryTransient açıkça false ise devre dışı kalır.
  const canRetry = retryTransient !== false && isIdempotentMethod(fetchOptions.method);
  const maxAttempts = canRetry ? 2 : 1;

  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await performApiFetch(url, fetchOptions, headers, native, requestTimeout, skipUnauthorized);
    } catch (error) {
      lastError = error;
      // Son deneme veya tekrar denenemeyen hata ise yükselt
      if (attempt >= maxAttempts || !isRetryableTransport(error)) throw error;
      // Kısa bekleme: bayat bağlantı tespit edilip yeniden bağlanması için fırsat ver
      await sleep(400);
    }
  }

  throw lastError;
}

// JSON API isteği — sunucu HTML hata dönerse güvenli parse
export async function apiJson(path, options = {}) {
  const startedAt = Date.now();
  const method = options.method || 'GET';

  let response;
  try {
    response = await apiFetch(path, options);
  } catch (error) {
    // Hata/timeout/network telemetriye düşer; hata semantiği değişmez (yeniden fırlatılır)
    recordRequest({
      endpoint: path,
      method,
      durationMs: Date.now() - startedAt,
      status: 0,
      timeout: error?.code === 'FETCH_TIMEOUT',
      networkError: error?.code === 'NETWORK_ERROR',
      safeMode: isSafeModeEnabled()
    });
    throw error;
  }

  const text = await response.text();
  let data = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = {
        error: response.ok
          ? 'Sunucu yanıtı okunamadı.'
          : 'Sunucu geçici olarak yanıt veremedi. Biraz sonra tekrar dene.',
        requestId: null,
        step: 'parse_response'
      };
    }
  }

  data = withRequestMeta(path, startedAt, data);

  if (!response.ok && !data.error && !data.message) {
    data.error = data.message || `İstek başarısız (${response.status})`;
  }

  if (!response.ok || data?.ok === false) {
    const formatted = formatClientApiError({ response, data, fallback: data?.error || data?.message });
    data.clientMessage = formatted.message;
    data.clientCode = formatted.code;
  }

  // Guardian telemetrisi + Safe Mode header senkronu (best-effort)
  try {
    const safeHeader = response.headers?.get?.('x-safe-mode');
    if (safeHeader != null) applySafeModeHeader(safeHeader);
    recordRequest({
      endpoint: path,
      method,
      durationMs: Date.now() - startedAt,
      status: response.status,
      requestId: response.headers?.get?.('x-request-id') || data?.requestId || null,
      safeMode: isSafeModeEnabled()
    });
  } catch {
    // Telemetri hatası API yanıtını etkilemez
  }

  return { response, data };
}

// Auth uçları — soğuk başlangıç + DB yazımı için daha uzun zaman aşımı
export const AUTH_REQUEST_OPTIONS = {
  timeoutMs: isNativeApp() && isIos() ? NATIVE_AUTH_FETCH_TIMEOUT_MS : AUTH_FETCH_TIMEOUT_MS
};
export const REGISTER_REQUEST_OPTIONS = { timeoutMs: 90_000 };
export const SYNC_REQUEST_OPTIONS = { timeoutMs: 25000 };
export const ADMIN_REQUEST_OPTIONS = { timeoutMs: 60_000 };
// Kasiyer LP işlemi — kullanıcı işlemin başında bekler; 60sn'lik genel admin
// zaman aşımı paneli çok uzun süre kilitli/donmuş gösterir. Bu yüzden LP
// aksiyonu daha kısa (15sn) tutulur; timeout sonrası kullanıcı tekrar dener.
export const LOYALTY_ACTION_REQUEST_OPTIONS = { timeoutMs: 15_000 };
