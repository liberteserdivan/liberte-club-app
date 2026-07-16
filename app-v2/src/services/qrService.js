import { apiJson } from '../lib/apiClient.js';
import { readApiError } from '../lib/apiClient.js';

export async function generateCustomerQr() {
  const { response, data } = await apiJson('/api/qr/generate', {
    method: 'POST',
    body: JSON.stringify({}),
    timeoutMs: 15000
  });
  if (!response.ok || !data?.token) {
    throw new Error(readApiError(data, 'QR oluşturulamadı'));
  }
  return data;
}

export async function verifyScannedQr(token) {
  const { response, data } = await apiJson('/api/admin?resource=qr-verify', {
    method: 'POST',
    body: JSON.stringify({ token }),
    timeoutMs: 20000
  });
  if (!response.ok || data?.ok === false) {
    throw new Error(readApiError(data, 'QR doğrulanamadı'));
  }
  return data;
}

export async function applyLoyaltyAction({ customerId, action, productId, amount }) {
  const { response, data } = await apiJson('/api/admin?resource=loyalty-action', {
    method: 'POST',
    body: JSON.stringify({ customerId, action, productId, amount }),
    timeoutMs: 25000
  });
  if (!response.ok || data?.ok === false) {
    throw new Error(readApiError(data, 'İşlem uygulanamadı'));
  }
  return data;
}
