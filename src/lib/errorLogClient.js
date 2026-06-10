// Hata log API istemcisi — Vercel function limiti nedeniyle /api/state üzerinden
import { apiFetch, apiJson } from './apiClient.js';

// Sunucuya hata kaydı gönder
export async function submitErrorLog(payload) {
  const { response } = await apiFetch('/api/state', {
    method: 'POST',
    body: JSON.stringify({ errorLog: payload })
  });
  return response.ok;
}

// Yönetici — log listesi
export async function fetchErrorLogs(limit = 200) {
  const { response, data } = await apiJson(`/api/state?errorLogs=1&limit=${limit}`);
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
  const { response, data } = await apiJson('/api/state', {
    method: 'POST',
    body: JSON.stringify({ action: 'clearErrorLogs' })
  });
  if (!response.ok) {
    throw new Error(data?.error || 'Loglar silinemedi');
  }
  return data.removed || 0;
}
