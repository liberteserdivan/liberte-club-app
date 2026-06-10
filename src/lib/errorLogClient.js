// Hata log API istemcisi
import { apiFetch, apiJson } from './apiClient.js';

const ERROR_LOGS_PATH = '/api/error-logs';

// Sunucuya hata kaydı gönder
export async function submitErrorLog(payload) {
  const { response } = await apiFetch(ERROR_LOGS_PATH, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.ok;
}

// Yönetici — log listesi
export async function fetchErrorLogs(limit = 200) {
  const { response, data } = await apiJson(`${ERROR_LOGS_PATH}?limit=${limit}`);
  if (!response.ok) {
    throw new Error(data?.error || 'Log listesi alınamadı');
  }
  return {
    logs: data.logs || [],
    retentionDays: data.retentionDays || 7
  };
}

// Yönetici — tüm logları sil
export async function clearErrorLogs() {
  const { response, data } = await apiJson(ERROR_LOGS_PATH, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error(data?.error || 'Loglar silinemedi');
  }
  return data.removed || 0;
}
