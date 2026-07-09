// API CORS ve cookie yardımcıları

import { isTransientDbError, publicDbErrorCode, publicDbErrorMessage } from './dbTransient.js';
import { isRouteDeadlineError } from './routeDeadline.js';
import { resolveAllowedOrigins } from './siteOrigins.js';

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

// Capacitor native uygulama kökenleri — ALLOWED_ORIGINS'ten bağımsız izin verilir
const NATIVE_APP_ORIGINS = new Set([
  'https://localhost',
  'http://localhost',
  'capacitor://localhost',
  'ionic://localhost',
  'https://localhost:8080',
  'http://localhost:8080'
]);

// iOS/Android Capacitor köken desenleri (hostname değişse bile)
function isNativeCapacitorOrigin(origin) {
  if (!origin) return false;
  if (NATIVE_APP_ORIGINS.has(origin)) return true;

  try {
    const url = new URL(origin);
    const protocol = url.protocol.replace(':', '');
    const host = url.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') return false;
    return protocol === 'https'
      || protocol === 'http'
      || protocol === 'capacitor'
      || protocol === 'ionic';
  } catch {
    return false;
  }
}

// İstek kaynağını doğrula
export function resolveOrigin(req) {
  const origin = req.headers.origin || '';
  if (!origin) return '';
  if (isNativeCapacitorOrigin(origin)) return origin;

  // Production'da boş whitelist ile tüm origin'lere izin verme
  if (ALLOWED_ORIGINS.length === 0) {
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
      const defaults = resolveAllowedOrigins();
      return defaults.includes(origin) ? origin : '';
    }
    return origin;
  }

  return ALLOWED_ORIGINS.includes(origin) ? origin : '';
}

// CORS başlıklarını ayarla — kimlik bilgisi destekli
export function applyCors(req, res, methods = 'GET,POST,OPTIONS') {
  const origin = resolveOrigin(req);
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// JSON gövdesini oku
export function readBody(req) {
  return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
}

// JSON gövdesini güvenli oku — parse hatasında boş nesne
export function readBodySafe(req) {
  try {
    return readBody(req);
  } catch {
    return {};
  }
}

// Production'da iç hata detayını gizle
export function publicErrorMessage(error, fallback = 'Bir hata oluştu. Lütfen tekrar dene.') {
  if (process.env.NODE_ENV !== 'production' && process.env.VERCEL_ENV !== 'production') {
    return error?.message || fallback;
  }
  return fallback;
}

// Gecici hata mi? (DB veya rota deadline)
function isTransientError(error) {
  return isTransientDbError(error) || isRouteDeadlineError(error);
}

// Merkezi API hata govdesi uret
export function buildApiErrorBody({
  code,
  message,
  step = null,
  requestId = null,
  timings = null,
  error = null
} = {}) {
  const transient = error ? isTransientError(error) : false;
  const resolvedCode = error
    ? publicDbErrorCode(error, code || 'SERVER_ERROR')
    : (code || 'SERVER_ERROR');
  const fallback = 'Islem tamamlanamadi. Lutfen tekrar deneyin.';
  const resolvedMessage = error
    ? publicDbErrorMessage(error, message || fallback)
    : (message || fallback);

  return {
    ok: false,
    code: transient ? 'DATABASE_TRANSIENT' : resolvedCode,
    message: resolvedMessage,
    error: resolvedMessage,
    ...(step ? { step } : {}),
    ...(requestId ? { requestId } : {}),
    ...(timings ? { timings } : {})
  };
}

// Merkezi API hata yaniti gonder
export function sendApiError(res, {
  status,
  code,
  message,
  step = null,
  requestId = null,
  timings = null,
  error = null
} = {}) {
  const transient = error ? isTransientError(error) : false;
  const httpStatus = transient ? 503 : (status || 500);
  const body = buildApiErrorBody({ code, message, step, requestId, timings, error });

  if (res.headersSent) return null;
  res.status(httpStatus).json(body);
  return body;
}
