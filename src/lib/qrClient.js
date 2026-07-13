import { apiJson, getStoredAuthTokenMeta, hasStoredAuthToken, ADMIN_REQUEST_OPTIONS, LOYALTY_ACTION_REQUEST_OPTIONS } from './apiClient.js';
import { isLocalAuth } from './devAuth.js';
import { isNativeApp } from './platform.js';

const QR_PREFIX = 'liberte-qr:';
export const QR_ENDPOINT = '/api/qr/generate';
export const QR_LEGACY_ENDPOINT = '/api/state?qrToken=1';

// Geliştirme ortamında QR debug logları
function qrDevLog(...args) {
  if (import.meta.env.DEV) console.log(...args);
}

function qrDevError(...args) {
  if (import.meta.env.DEV) console.error(...args);
}

// QR isteği debug özeti
export function buildQrFetchDebug(response, data, endpoint = QR_ENDPOINT) {
  return {
    endpoint,
    method: 'POST',
    httpStatus: response?.status ?? null,
    durationMs: data?._meta?.durationMs ?? null,
    requestId: data?.requestId || null,
    code: data?.code || null,
    step: data?.step || null,
    hasBearerToken: hasStoredAuthToken(),
    isNativeApp: isNativeApp(),
    ok: Boolean(response?.ok && data?.ok !== false),
    hasQrToken: Boolean(data?.token || data?.qrToken),
    hasQrPayload: Boolean(data?.qrPayload),
    payloadLength: String(data?.qrPayload || data?.token || '').length
  };
}

// Kullanıcıya gösterilecek QR hata mesajını oluştur
export function formatQrUserError(error, response = null, data = {}) {
  if (error?.name === 'AbortError') {
    return { message: '', requestId: null, abort: true };
  }

  const requestId = data?.requestId || error?.requestId || null;
  const httpStatus = response?.status ?? error?.httpStatus ?? null;
  const code = data?.code || error?.code || null;
  const refSuffix = requestId ? ` Ref: ${requestId}` : '';

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { message: 'Bağlantı yok. QR yenilenemedi.', requestId, code: 'OFFLINE', abort: false };
  }

  if (error?.code === 'FETCH_TIMEOUT') {
    return { message: `Sunucuya ulaşılamadı.${refSuffix}`, requestId, code: 'FETCH_TIMEOUT', abort: false };
  }

  if (httpStatus === 401) {
    return {
      message: `${data?.message || 'Oturum süresi doldu. Lütfen tekrar giriş yap.'}${refSuffix}`,
      requestId,
      code: code || 'SESSION_REQUIRED',
      abort: false
    };
  }

  if (httpStatus === 403) {
    return {
      message: `${data?.message || 'QR oluşturma yetkisi yok.'}${refSuffix}`,
      requestId,
      code: code || 'FORBIDDEN',
      abort: false
    };
  }

  if (httpStatus === 404) {
    return {
      message: `QR servisi bulunamadı.${refSuffix}`,
      requestId,
      code: code || 'NOT_FOUND',
      abort: false
    };
  }

  if (httpStatus >= 500) {
    return {
      message: `${data?.message || data?.error || 'QR oluşturulamadı.'}${refSuffix}`,
      requestId,
      code: code || 'QR_GENERATE_FAILED',
      abort: false
    };
  }

  if (data?.ok === false || (response && !response.ok)) {
    return {
      message: `${data?.message || data?.error || 'QR oluşturulamadı.'}${refSuffix}`,
      requestId,
      code: code || 'QR_GENERATE_FAILED',
      abort: false
    };
  }

  const raw = String(error?.message || '');
  if (raw.includes('Failed to fetch') || raw.includes('bağlan')) {
    return { message: `Sunucuya ulaşılamadı.${refSuffix}`, requestId, code: 'NETWORK_ERROR', abort: false };
  }

  return {
    message: `${raw || 'QR oluşturulamadı.'}${refSuffix}`,
    requestId,
    code: code || 'QR_GENERATE_FAILED',
    abort: false
  };
}

// İmzalı QR metnini oluştur
export function formatSignedQrValue(token) {
  return `${QR_PREFIX}${token}`;
}

// Okunan QR metnini temizle (BOM, sıfır genişlik, boşluk)
function cleanQrRawText(rawText) {
  return String(rawText || '')
    .replace(/^\uFEFF/, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
}

// Okunan QR metninden imzalı token ayıkla
function extractSignedQrToken(text) {
  const lower = text.toLowerCase();
  const prefixAt = lower.indexOf(QR_PREFIX);
  if (prefixAt >= 0) {
    const rest = text.slice(prefixAt + QR_PREFIX.length).trim();
    const match = rest.match(/^v\d+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    return match ? match[0] : rest.split(/\s+/)[0] || '';
  }

  // Ham v1.body.sig veya metin içine gömülü token
  const embedded = text.match(/v\d+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  return embedded ? embedded[0] : '';
}

// LC-1781… veya düz üye numarası
function extractMemberIdFromText(text) {
  const direct = text.match(/^(?:lc[-\s]?)?(\d{10,})$/i);
  if (direct) return Number(direct[1]);
  const embedded = text.match(/(?:lc[-\s]?)(\d{10,})/i);
  if (embedded) return Number(embedded[1]);
  return null;
}

// Okunan QR metnini ayrıştır
export function parseQrScanText(rawText) {
  const text = cleanQrRawText(rawText);
  if (!text) return { type: 'invalid' };

  const signedToken = extractSignedQrToken(text);
  if (signedToken) {
    return { type: 'signed', token: signedToken };
  }

  try {
    const parsed = JSON.parse(text);
    if (parsed?.type === 'liberte-customer') {
      return { type: 'legacy', payload: parsed };
    }
  } catch {
    // Geçersiz JSON
  }

  const memberId = extractMemberIdFromText(text);
  if (memberId) {
    return { type: 'memberId', memberId };
  }

  return { type: 'invalid' };
}

// Canlı ortamda imzalı QR zorunlu mu?
export function isSignedQrRequired() {
  return !isLocalAuth();
}

// expiresAt değerini ms timestamp'e çevir
export function parseQrExpiresAt(value, ttlSeconds = 90) {
  if (typeof value === 'string' && value) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  return Date.now() + ttlSeconds * 1000;
}

// Müşteri — sunucudan kısa ömürlü QR token al
export async function fetchCustomerQrToken(options = {}) {
  const { signal, timeoutMs, customerId = null } = options;
  const resolvedTimeout = Number(timeoutMs) > 0
    ? Number(timeoutMs)
    : (isNativeApp() ? 18_000 : 10_000);
  const tokenMeta = getStoredAuthTokenMeta();

  qrDevLog('[qr.frontend] start', {
    customerId,
    sessionTokenExists: tokenMeta.exists,
    endpoint: QR_ENDPOINT,
    method: 'POST'
  });

  let response;
  let data = {};

  try {
    ({ response, data } = await apiJson(QR_ENDPOINT, {
      method: 'POST',
      body: JSON.stringify({ customerId }),
      signal,
      timeoutMs: resolvedTimeout,
      skipUnauthorized: true
    }));

    qrDevLog('[qr.frontend] response', {
      status: response?.status,
      ok: data?.ok,
      code: data?.code,
      requestId: data?.requestId,
      hasQrPayload: Boolean(data?.qrPayload),
      hasQrToken: Boolean(data?.qrToken),
      durationMs: data?._meta?.durationMs
    });

    if (!response.ok || data?.ok === false) {
      const formatted = formatQrUserError(null, response, data);
      const err = new Error(formatted.message || 'QR oluşturulamadı.');
      err.requestId = formatted.requestId;
      err.code = formatted.code;
      err.httpStatus = response.status;
      err.debug = buildQrFetchDebug(response, data);
      throw err;
    }

    const qrValue = String(data.qrPayload || data.qrToken || data.token || '').trim();
    if (!qrValue || qrValue === 'liberte-qr:') {
      const formatted = formatQrUserError(
        new Error('QR yanıtı geçersiz — payload boş.'),
        response,
        data
      );
      const err = new Error(formatted.message);
      err.requestId = formatted.requestId || data?.requestId || null;
      err.code = 'QR_INVALID_RESPONSE';
      err.httpStatus = response.status;
      err.debug = buildQrFetchDebug(response, data);
      throw err;
    }

    const token = String(data.qrToken || data.token || '').trim()
      || (qrValue.startsWith(QR_PREFIX) ? qrValue.slice(QR_PREFIX.length) : qrValue);

    const result = {
      ...data,
      token,
      qrToken: token,
      qrPayload: qrValue.startsWith(QR_PREFIX) ? qrValue : formatSignedQrValue(token),
      expiresAtMs: parseQrExpiresAt(data.expiresAt, data.ttlSeconds),
      debug: buildQrFetchDebug(response, data)
    };

    qrDevLog('[qr.frontend] render', {
      qrValueLength: result.qrPayload.length,
      state: 'ready'
    });

    return result;
  } catch (error) {
    if (error?.name === 'AbortError') throw error;

    qrDevError('[qr.frontend] error', error);

    if (error?.requestId || error?.code || error?.debug) throw error;

    const formatted = formatQrUserError(error, response, data);
    if (formatted.abort) throw error;

    const wrapped = new Error(formatted.message || 'QR oluşturulamadı.');
    wrapped.requestId = formatted.requestId;
    wrapped.code = formatted.code;
    wrapped.httpStatus = response?.status ?? null;
    wrapped.debug = {
      endpoint: QR_ENDPOINT,
      method: 'POST',
      httpStatus: response?.status ?? null,
      durationMs: data?._meta?.durationMs ?? null,
      hasBearerToken: hasStoredAuthToken(),
      isNativeApp: isNativeApp(),
      ok: false,
      code: formatted.code || 'NETWORK_ERROR',
      requestId: formatted.requestId
    };
    throw wrapped;
  }
}

// Kasiyer — imzalı QR doğrula (süresi dolmuşsa da üye kartı açılır)
export async function verifyCustomerQr(token) {
  try {
    const { response, data } = await apiJson('/api/admin?resource=qr-verify', {
      method: 'POST',
      body: JSON.stringify({ token }),
      ...ADMIN_REQUEST_OPTIONS
    });

    if (!response.ok) {
      const formatted = formatQrUserError(null, response, data);
      throw new Error(data?.error || formatted.message || 'QR doğrulanamadı');
    }

    if (!data?.customer?.id) {
      throw new Error('Müşteri bilgisi alınamadı. Tekrar deneyin.');
    }

    return {
      customer: data.customer,
      expired: Boolean(data.expired),
      warning: data.warning || null
    };
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    const formatted = formatQrUserError(error);
    throw new Error(error?.message || formatted.message || 'QR doğrulanamadı');
  }
}

// Kasiyer — üye no / LC- ile üye özeti (imzalı QR yoksa)
export async function lookupAdminMemberById(memberId) {
  const { response, data } = await apiJson('/api/admin?resource=member-lookup', {
    method: 'POST',
    body: JSON.stringify({ memberId }),
    ...ADMIN_REQUEST_OPTIONS
  });

  if (!response.ok) {
    throw new Error(data?.error || 'Üye bulunamadı');
  }
  if (!data?.customer?.id) {
    throw new Error('Üye bulunamadı');
  }
  return data.customer;
}

// Kasiyer — damga / ikram / check-in (sunucu doğrular)
export async function postLoyaltyAction({ token, action, category, menuItemId = null, count = 1 }) {
  try {
    const { response, data } = await apiJson('/api/admin?resource=loyalty-action', {
      method: 'POST',
      body: JSON.stringify({ token, action, category, menuItemId, count }),
      ...LOYALTY_ACTION_REQUEST_OPTIONS
    });

    if (!response.ok) {
      const formatted = formatQrUserError(null, response, data);
      throw new Error(formatted.message || 'İşlem yapılamadı');
    }

    return data;
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    const formatted = formatQrUserError(error);
    throw new Error(formatted.message || error?.message || 'İşlem yapılamadı');
  }
}
