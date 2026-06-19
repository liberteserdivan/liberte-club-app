import { formatClientApiError } from './apiErrors.js';
import { isNativeApp } from './platform.js';

const TOKEN_KEY = 'liberteAuthToken';
const NATIVE_API_ORIGIN = 'https://app.liberte.cafe';

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

// Oturum tokenını sakla — web + native (Capacitor cross-origin için Bearer şart)
export function saveAuthToken(token) {
  if (!token) return;
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
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
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
  try {
    return sessionStorage.getItem(TOKEN_KEY)
      || localStorage.getItem(TOKEN_KEY)
      || '';
  } catch {
    return '';
  }
}

const FETCH_TIMEOUT_MS = 12000;
const AUTH_FETCH_TIMEOUT_MS = 25000;

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

// Fetch isteğine üst zaman sınırı ekle
function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const { signal: userSignal, ...rest } = options;
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
      if (timedOut) {
        const timeoutErr = new Error('Sunucuya ulaşılamadı.');
        timeoutErr.code = 'FETCH_TIMEOUT';
        throw timeoutErr;
      }
      const abortErr = new Error('İstek iptal edildi.');
      abortErr.name = 'AbortError';
      throw abortErr;
    });
}

// Kimlik bilgili API isteği
export async function apiFetch(path, options = {}) {
  const { timeoutMs, skipUnauthorized = false, ...fetchOptions } = options;
  const headers = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers || {})
  };

  const token = readStoredAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const native = isNativeApp();
  const url = resolveApiUrl(path);
  const requestTimeout = Number(timeoutMs) > 0 ? Number(timeoutMs) : FETCH_TIMEOUT_MS;

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
    if (native && error?.message === 'Failed to fetch') {
      const netErr = new Error('Sunucuya bağlanılamadı. İnternet bağlantını kontrol et.');
      netErr.code = 'NETWORK_ERROR';
      throw netErr;
    }
    throw error;
  }
}

// JSON API isteği — sunucu HTML hata dönerse güvenli parse
export async function apiJson(path, options = {}) {
  const startedAt = Date.now();
  const response = await apiFetch(path, options);
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

  return { response, data };
}

// Auth uçları — soğuk başlangıç + DB yazımı için daha uzun zaman aşımı
export const AUTH_REQUEST_OPTIONS = { timeoutMs: AUTH_FETCH_TIMEOUT_MS };
export const REGISTER_REQUEST_OPTIONS = { timeoutMs: 90_000 };
export const SYNC_REQUEST_OPTIONS = { timeoutMs: 25000 };
export const ADMIN_REQUEST_OPTIONS = { timeoutMs: 60_000 };
