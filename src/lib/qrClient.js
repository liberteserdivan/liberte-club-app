import { apiJson, hasStoredAuthToken } from './apiClient.js';
import { useLocalAuth } from './devAuth.js';
import { isNativeApp } from './platform.js';

const QR_PREFIX = 'liberte-qr:';
const QR_ENDPOINT = '/api/state?qrToken=1';

// API hata mesajını kullanıcıya uygun metne çevir
function mapQrApiError(response, data, fallback) {
  if (response?.status === 401) {
    return data?.message || 'Oturum süresi doldu. Lütfen tekrar giriş yap.';
  }
  if (response?.status === 403) {
    return data?.message || 'QR oluşturma yetkisi yok.';
  }
  if (response?.status === 409) {
    return 'Veri güncellendi. Lütfen tekrar dene.';
  }
  if (response?.status >= 500) {
    return data?.message || data?.error || 'Sunucu geçici olarak yanıt vermiyor. Biraz sonra tekrar dene.';
  }
  return data?.message || data?.error || fallback;
}

// Ağ hatasını kasa ekranına uygun mesaja çevir
function wrapQrNetworkError(error, fallback) {
  const message = error?.message || '';
  if (
    message.includes('bağlan')
    || message.includes('yanıt vermedi')
    || message.includes('Failed to fetch')
    || error?.name === 'AbortError'
  ) {
    return new Error('İnternet bağlantısı yok veya sunucuya ulaşılamadı. İşlem kaydedilmedi.');
  }
  return new Error(message || fallback);
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
    const data = JSON.parse(text);
    if (data?.type === 'liberte-customer') {
      return { type: 'legacy', payload: data };
    }
  } catch {
    // Geçersiz JSON — aşağıda invalid döner
  }

  return { type: 'invalid' };
}

// Canlı ortamda imzalı QR zorunlu mu?
export function isSignedQrRequired() {
  return !useLocalAuth();
}

// QR isteği debug özeti
export function buildQrFetchDebug(response, data) {
  return {
    endpoint: QR_ENDPOINT,
    method: 'GET',
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

// Müşteri — sunucudan kısa ömürlü QR token al
export async function fetchCustomerQrToken(options = {}) {
  const { signal, timeoutMs = 10000 } = options;
  let response;
  let data = {};

  try {
    ({ response, data } = await apiJson(QR_ENDPOINT, { signal, timeoutMs }));

    if (!response.ok || data?.ok === false) {
      const err = new Error(mapQrApiError(response, data, data?.message || 'QR oluşturulamadı.'));
      err.requestId = data?.requestId || null;
      err.code = data?.code || 'QR_GENERATE_FAILED';
      err.httpStatus = response.status;
      err.debug = buildQrFetchDebug(response, data);
      throw err;
    }

    const token = String(data.token || data.qrToken || '').trim();
    if (!token) {
      const err = new Error('QR yanıtı geçersiz — token boş.');
      err.requestId = data?.requestId || null;
      err.code = 'QR_INVALID_RESPONSE';
      err.httpStatus = response.status;
      err.debug = buildQrFetchDebug(response, data);
      throw err;
    }

    const qrPayload = String(data.qrPayload || '').trim() || formatSignedQrValue(token);
    return {
      ...data,
      token,
      qrToken: token,
      qrPayload,
      debug: buildQrFetchDebug(response, data)
    };
  } catch (error) {
    if (error?.requestId || error?.code || error?.debug) throw error;
    const wrapped = wrapQrNetworkError(error, 'QR oluşturulamadı.');
    wrapped.debug = {
      endpoint: QR_ENDPOINT,
      method: 'GET',
      httpStatus: response?.status ?? null,
      durationMs: data?._meta?.durationMs ?? null,
      hasBearerToken: hasStoredAuthToken(),
      isNativeApp: isNativeApp(),
      ok: false,
      code: 'NETWORK_ERROR'
    };
    throw wrapped;
  }
}

// Kasiyer — imzalı QR doğrula
export async function verifyCustomerQr(token) {
  try {
    const { response, data } = await apiJson('/api/admin?resource=qr-verify', {
      method: 'POST',
      body: JSON.stringify({ token })
    });

    if (!response.ok) {
      throw new Error(mapQrApiError(response, data, 'QR doğrulanamadı'));
    }

    return data.customer;
  } catch (error) {
    throw wrapQrNetworkError(error, 'QR doğrulanamadı');
  }
}

// Kasiyer — damga / ikram / check-in (sunucu doğrular)
export async function postLoyaltyAction({ token, action, category, menuItemId = null }) {
  try {
    const { response, data } = await apiJson('/api/admin?resource=loyalty-action', {
      method: 'POST',
      body: JSON.stringify({ token, action, category, menuItemId })
    });

    if (!response.ok) {
      throw new Error(mapQrApiError(response, data, 'İşlem yapılamadı'));
    }

    return data;
  } catch (error) {
    throw wrapQrNetworkError(error, 'İşlem yapılamadı');
  }
}
