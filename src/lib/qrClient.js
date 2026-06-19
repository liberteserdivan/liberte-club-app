import { apiJson, getStoredAuthTokenMeta, hasStoredAuthToken, ADMIN_REQUEST_OPTIONS } from './apiClient.js';
import { useLocalAuth } from './devAuth.js';
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

// Okunan QR metnini ayrıştır
export function parseQrScanText(rawText) {
  const text = String(rawText || '').trim();

  if (text.startsWith(QR_PREFIX)) {
    return { type: 'signed', token: text.slice(QR_PREFIX.length) };
  }

  try {
    const parsed = JSON.parse(text);
    if (parsed?.type === 'liberte-customer') {
      return { type: 'legacy', payload: parsed };
    }
  } catch {
    // Geçersiz JSON
  }

  return { type: 'invalid' };
}

// Canlı ortamda imzalı QR zorunlu mu?
export function isSignedQrRequired() {
  return !useLocalAuth();
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
  const { signal, timeoutMs = 10000, customerId = null } = options;
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
      timeoutMs,
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

// Kasiyer — imzalı QR doğrula
export async function verifyCustomerQr(token) {
  try {
    const { response, data } = await apiJson('/api/admin?resource=qr-verify', {
      method: 'POST',
      body: JSON.stringify({ token }),
      ...ADMIN_REQUEST_OPTIONS
    });

    if (!response.ok) {
      const formatted = formatQrUserError(null, response, data);
      throw new Error(formatted.message || 'QR doğrulanamadı');
    }

    return data.customer;
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    const formatted = formatQrUserError(error);
    throw new Error(formatted.message || error?.message || 'QR doğrulanamadı');
  }
}

// Kasiyer — damga / ikram / check-in (sunucu doğrular)
export async function postLoyaltyAction({ token, action, category, menuItemId = null }) {
  try {
    const { response, data } = await apiJson('/api/admin?resource=loyalty-action', {
      method: 'POST',
      body: JSON.stringify({ token, action, category, menuItemId }),
      ...ADMIN_REQUEST_OPTIONS
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
