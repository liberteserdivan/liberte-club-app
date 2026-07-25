import { apiJson } from './apiClient.js';

// Günlük giriş ödülü kaldırıldı — eski çağrılar da LP basmaz
export async function claimDailyLoginRewardRemote() {
  const { response, data } = await apiJson('/api/loyalty/daily-claim', {
    method: 'POST',
    body: JSON.stringify({}),
    timeoutMs: 15000,
    skipUnauthorized: true
  });

  return {
    ok: false,
    disabled: true,
    code: data?.code || (response.status === 410 ? 'DAILY_CLAIM_DISABLED' : null),
    error: data?.error || 'Günlük giriş ödülü artık sunulmuyor.'
  };
}
