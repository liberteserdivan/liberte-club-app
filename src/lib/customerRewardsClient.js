import { apiJson } from './apiClient.js';

// Günlük giriş ödülünü sunucuda kaydet
export async function claimDailyLoginRewardRemote() {
  const { response, data } = await apiJson('/api/loyalty/daily-claim', {
    method: 'POST',
    body: JSON.stringify({}),
    timeoutMs: 30000
  });

  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || data?.message || 'Günlük ödül kaydedilemedi');
  }

  return data;
}
