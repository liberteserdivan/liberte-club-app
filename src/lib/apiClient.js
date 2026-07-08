import { formatClientApiError } from './apiErrors.js';
import { isNativeApp, isIos, isAndroid } from './platform.js';
import { recordRequest } from './guardianTelemetry.js';
import { applySafeModeHeader, isSafeModeEnabled } from './safeMode.js';
import { getAuthEpoch } from './authEpoch.js';

// Kalıcı native API kökü — özel domain (Vercel *.vercel.app bazı mobil DNS'lerde çözülmüyor)
export const DEFAULT_NATIVE_API_ORIGIN = 'https://app.liberte.cafe';
export const DEFAULT_PUBLIC_SITE_ORIGIN = DEFAULT_NATIVE_API_ORIGIN;

const TOKEN_KEY = 'liberteAuthToken';
// Temizlenmesi gereken eski/legacy token anahtarları — çıkışta hepsi silinir
const LEGACY_TOKEN_KEYS = [TOKEN_KEY, 'liberteNativeAuthToken', 'liberteSessionToken'];

// Native (Capacitor) build'in vuracağı API kökü. Build-time VITE_API_BASE_URL ile
// yönetilir; geçersiz/boşsa kalıcı Vercel production fallback kullanılır.
// Web/PWA bu sabiti KULLANMAZ (relative path → same-origin).
const FALLBACK_NATIVE_API_ORIGIN = DEFAULT_NATIVE_API_ORIGIN;

// Geliştirme ortamı mı — yalnızca dev'de http://localhost gibi güvensiz köke izin verilir
function isDevEnv() {
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    return false;
  }
}

// API origin'ini normalize et:
// - boş/geçersiz değeri yok say (null döner → fallback devreye girer)
// - sadece origin (scheme://host[:port]) kabul edilir, trailing slash/path atılır
// - production'da yalnızca https:// kabul edilir
// - allowInsecure (yalnızca dev) ise http://localhost veya http://127.0.0.1 kabul edilir
export function normalizeApiOrigin(value, { allowInsecure = false } = {}) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const isHttps = url.protocol === 'https:';
  const isLocalHttp = url.protocol === 'http:'
    && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');

  if (!isHttps && !(allowInsecure && isLocalHttp)) return null;

  // url.origin trailing slash içermez ve path/query'i düşürür → temiz köken
  return url.origin;
}

// Native build'in kullanacağı API kökü — env'den çözülür, geçersizse fallback
function resolveNativeApiOrigin() {
  let configured = null;
  try {
    configured = normalizeApiOrigin(import.meta.env?.VITE_API_BASE_URL, {
      allowInsecure: isDevEnv()
    });
  } catch {
    configured = null;
  }
  return configured || FALLBACK_NATIVE_API_ORIGIN;
}

const NATIVE_API_ORIGIN = resolveNativeApiOrigin();

// Native build'in çözdüğü API kökü — teşhis/test için (secret loglanmaz)
export function getNativeApiOrigin() {
  return NATIVE_API_ORIGIN;
}

// Debug-safe köken bilgisi — tam URL'yi açıkça loglamadan host'u maskeler
function maskApiOrigin(origin) {
  try {
    const { protocol, hostname } = new URL(origin);
    const masked = hostname.length > 6
      ? `${hostname.slice(0, 3)}***${hostname.slice(-3)}`
      : `${hostname.slice(0, 1)}***`;
    return `${protocol}//${masked}`;
  } catch {
    return 'gizli';
  }
}

// Native teşhis — PIN/token/telefon loglanmaz; yalnızca host maskeli ve path/status
function logNativeApiDiag(path, response, data = {}) {
  if (!isNativeApp()) return;
  try {
    const platform = isIos() ? 'ios' : (isAndroid() ? 'android' : 'native');
    console.info('[api]', {
      platform,
      webOrigin: typeof window !== 'undefined' ? (window.location?.origin || '') : '',
      apiHost: maskApiOrigin(NATIVE_API_ORIGIN),
      path: String(path || '').split('?')[0],
      status: response?.status ?? 0,
      requestId: response?.headers?.get?.('x-request-id') || data?.requestId || null,
      step: data?.step || null,
      code: data?.code || null
    });
  } catch {
    // Teşhis hatası isteği etkilemez
  }
}

// Dev ortamda maskelenmiş köken bilgisini bir kez yaz
if (isDevEnv() && isNativeApp()) {
  console.info('[apiClient] native API origin:', maskApiOrigin(NATIVE_API_ORIGIN));
}

// Web'de token kalıcı depoya YAZILMAZ; yalnızca bellekte tutulur (httpOnly cookie
// kalıcılığı sağlar). Bu, XSS ile token çalınması yüzeyini küçültür.
let memoryAuthToken = '';

let onUnauthorized = null;

export function setUnauthorizedHandler(handler) {
  onUnauthorized = typeof handler === 'function' ? handler : null;
}

// İstek yolunu tam URL'ye çevir.
// - absolute URL gelirse olduğu gibi döner
// - native ise yapılandırılmış köke göre tam URL
// - web/PWA ise relative path (same-origin) korunur
// native/origin parametreleri test edilebilirlik için enjekte edilebilir;
// üretimde varsayılanlar (isNativeApp + NATIVE_API_ORIGIN) kullanılır.
export function resolveApiUrl(path, native = isNativeApp(), origin = NATIVE_API_ORIGIN) {
  if (/^https?:\/\//i.test(path)) return path;
  if (native) {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return `${origin}${normalized}`;
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

// Capacitor native fetch (iOS + Android) — CapacitorHttp + AbortController sinyali
// POST isteğinde promise'i hiç settle etmeyebiliyor (çıkış sonrası login dahil).
// Sinyal GEÇMEYİZ; zaman aşımını Promise.race ile garanti ederiz.
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
  // CapacitorHttp etkin native uygulamada AbortController POST'u asılı bırakabilir
  if (isNativeApp()) {
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
async function performApiFetch(url, fetchOptions, headers, native, requestTimeout, skipUnauthorized, epochAtStart) {
  try {
    const response = await fetchWithTimeout(url, {
      ...fetchOptions,
      headers,
      credentials: native ? 'omit' : 'include'
    }, requestTimeout);

    // Bayat uçuş 401'i yeni login'i veya logout sonrası girişi bozmamalı
    if (response.status === 401 && onUnauthorized && !skipUnauthorized && getAuthEpoch() === epochAtStart) {
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
  const { timeoutMs, skipUnauthorized = false, retryTransient, omitAuth = false, ...fetchOptions } = options;
  const epochAtStart = getAuthEpoch();
  const headers = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers || {})
  };

  // Giriş/kayıt: bayat Bearer gönderme (çıkış sonrası iOS native yarışması)
  if (!omitAuth) {
    const token = readStoredAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

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
      return await performApiFetch(url, fetchOptions, headers, native, requestTimeout, skipUnauthorized, epochAtStart);
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
    logNativeApiDiag(path, null, {
      code: error?.code || null,
      step: error?.code === 'FETCH_TIMEOUT' ? 'fetch_timeout' : 'network_error'
    });
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

  logNativeApiDiag(path, response, data);

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

// Auth uçları — native soğuk başlangıç için uzun zaman aşımı (Android + iOS)
export const AUTH_REQUEST_OPTIONS = {
  timeoutMs: isNativeApp() ? NATIVE_AUTH_FETCH_TIMEOUT_MS : AUTH_FETCH_TIMEOUT_MS
};
export const REGISTER_REQUEST_OPTIONS = { timeoutMs: 90_000 };
export const SYNC_REQUEST_OPTIONS = { timeoutMs: 25000 };
export const ADMIN_REQUEST_OPTIONS = { timeoutMs: 60_000 };
export const ADMIN_MEMBERS_REQUEST_OPTIONS = {
  timeoutMs: isNativeApp() ? 45_000 : 20_000
};
// Kasiyer LP işlemi — kullanıcı işlemin başında bekler; 60sn'lik genel admin
// zaman aşımı paneli çok uzun süre kilitli/donmuş gösterir. Bu yüzden LP
// aksiyonu daha kısa (15sn) tutulur; timeout sonrası kullanıcı tekrar dener.
export const LOYALTY_ACTION_REQUEST_OPTIONS = { timeoutMs: 15_000 };
