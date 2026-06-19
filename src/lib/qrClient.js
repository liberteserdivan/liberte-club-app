import { apiJson } from './apiClient.js';
import { useLocalAuth } from './devAuth.js';

const QR_PREFIX = 'liberte-qr:';

// API hata mesajını kullanıcıya uygun metne çevir
function mapQrApiError(response, data, fallback) {
  if (response?.status === 401) {
    return 'Oturum süresi doldu. Lütfen tekrar giriş yap.';
  }
  if (response?.status === 409) {
    return 'Veri güncellendi. Lütfen tekrar dene.';
  }
  if (response?.status >= 500) {
    return 'Sunucu geçici olarak yanıt vermiyor. Biraz sonra tekrar dene.';
  }
  return data?.error || fallback;
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

// Müşteri — sunucudan kısa ömürlü QR token al
export async function fetchCustomerQrToken() {
  try {
    const { response, data } = await apiJson('/api/state?qrToken=1');
    if (!response.ok) {
      throw new Error(mapQrApiError(response, data, 'QR token alınamadı'));
    }
    return data;
  } catch (error) {
    throw wrapQrNetworkError(error, 'QR token alınamadı');
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
