import { apiJson } from './apiClient.js';
import { useLocalAuth } from './devAuth.js';

const QR_PREFIX = 'liberte-qr:';

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
  const { response, data } = await apiJson('/api/state?qrToken=1');
  if (!response.ok) {
    throw new Error(data.error || 'QR token alınamadı');
  }
  return data;
}

// Kasiyer — imzalı QR doğrula
export async function verifyCustomerQr(token) {
  const { response, data } = await apiJson('/api/admin?resource=qr-verify', {
    method: 'POST',
    body: JSON.stringify({ token })
  });

  if (!response.ok) {
    throw new Error(data.error || 'QR doğrulanamadı');
  }

  return data.customer;
}

// Kasiyer — damga / ikram / check-in (sunucu doğrular)
export async function postLoyaltyAction({ token, action, category }) {
  const { response, data } = await apiJson('/api/admin?resource=loyalty-action', {
    method: 'POST',
    body: JSON.stringify({ token, action, category })
  });

  if (!response.ok) {
    throw new Error(data.error || 'İşlem yapılamadı');
  }

  return data;
}
