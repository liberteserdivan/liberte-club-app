import { isNativeApp, isIos, isAndroid } from './platform.js';
import { getAuthEpoch } from './authEpoch.js';
import { DEFAULT_API_ORIGIN } from './constants.js';

const TOKEN_KEY = 'liberteAuthToken';
const LEGACY_TOKEN_KEYS = [TOKEN_KEY, 'liberteNativeAuthToken', 'liberteSessionToken'];

function normalizeApiOrigin(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1'))) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function resolveNativeApiOrigin() {
  try {
    return normalizeApiOrigin(import.meta.env?.VITE_API_BASE_URL) || DEFAULT_API_ORIGIN;
  } catch {
    return DEFAULT_API_ORIGIN;
  }
}

const NATIVE_API_ORIGIN = resolveNativeApiOrigin();
export function getNativeApiOrigin() { return NATIVE_API_ORIGIN; }

let memoryAuthToken = '';
let onUnauthorized = null;

export function setUnauthorizedHandler(fn) {
  onUnauthorized = typeof fn === 'function' ? fn : null;
}

export function setAuthToken(token) {
  const value = String(token || '').trim();
  memoryAuthToken = value;
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* depolama kapalı */ }
}

export function clearAuthToken() {
  memoryAuthToken = '';
  try {
    for (const key of LEGACY_TOKEN_KEYS) localStorage.removeItem(key);
  } catch { /* yoksay */ }
}

function readStoredAuthToken() {
  if (memoryAuthToken) return memoryAuthToken;
  try {
    memoryAuthToken = localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    memoryAuthToken = '';
  }
  return memoryAuthToken;
}

export function getStoredAuthToken() {
  return readStoredAuthToken();
}

function resolveApiUrl(path) {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (isNativeApp()) return `${NATIVE_API_ORIGIN}${clean}`;
  return clean;
}

function makeTimeoutError() {
  const err = new Error('Sunucuya ulaşılamadı.');
  err.code = 'FETCH_TIMEOUT';
  return err;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithTimeout(url, options, timeoutMs) {
  if (isNativeApp()) {
    let timer = null;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(makeTimeoutError()), timeoutMs);
    });
    try {
      return await Promise.race([fetch(url, options), timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw makeTimeoutError();
    const net = new Error('Ağ bağlantısı kurulamadı.');
    net.code = 'NETWORK_ERROR';
    throw net;
  } finally {
    clearTimeout(timer);
  }
}

function resolveTimeout(timeoutMs) {
  if (Number(timeoutMs) > 0) return Number(timeoutMs);
  return isNativeApp() ? 20000 : 12000;
}

export const AUTH_REQUEST_OPTIONS = {
  timeoutMs: isNativeApp() ? 20000 : 18000,
  retryTransient: false
};

export const ADMIN_REQUEST_OPTIONS = { timeoutMs: 60000 };
export const ADMIN_MEMBERS_REQUEST_OPTIONS = {
  timeoutMs: isNativeApp() ? 45000 : 20000
};

export async function apiFetch(path, options = {}) {
  const {
    timeoutMs,
    skipUnauthorized = false,
    retryTransient,
    omitAuth = false,
    ...fetchOptions
  } = options;
  const epochAtStart = getAuthEpoch();
  const headers = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers || {})
  };
  if (!omitAuth) {
    const token = readStoredAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const native = isNativeApp();
  const url = resolveApiUrl(path);
  const requestTimeout = resolveTimeout(timeoutMs);
  const method = String(fetchOptions.method || 'GET').toUpperCase();
  const canRetry = retryTransient !== false && (method === 'GET' || method === 'HEAD');
  const maxAttempts = canRetry ? 2 : 1;

  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, {
        ...fetchOptions,
        headers,
        credentials: native ? 'omit' : 'include'
      }, requestTimeout);

      if (response.status === 401 && onUnauthorized && !skipUnauthorized && getAuthEpoch() === epochAtStart) {
        onUnauthorized('expired');
      }
      return response;
    } catch (error) {
      lastError = error;
      const retryable = error?.code === 'FETCH_TIMEOUT' || error?.code === 'NETWORK_ERROR';
      if (attempt >= maxAttempts || !retryable) throw error;
      await sleep(400);
    }
  }
  throw lastError;
}

export async function apiJson(path, options = {}) {
  const response = await apiFetch(path, options);
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: 'Sunucu yanıtı okunamadı.' };
    }
  }
  return { response, data };
}

export function readApiError(data, fallback = 'İşlem başarısız') {
  return data?.error || data?.message || fallback;
}
