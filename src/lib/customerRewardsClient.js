import { apiJson } from './apiClient.js';

// Gunluk giris odulunu sunucuda kaydet - yapilandirilmis yanit
export async function claimDailyLoginRewardRemote() {
  const { response, data } = await apiJson('/api/loyalty/daily-claim', {
    method: 'POST',
    body: JSON.stringify({}),
    timeoutMs: 15000,
    skipUnauthorized: true
  });

  // Geçici altyapı sorunu — kontrollü 503
  if (response.status === 503) {
    return {
      ok: false,
      transient: true,
      code: data?.code || 'DAILY_CLAIM_TEMPORARILY_UNAVAILABLE',
      error: data?.error || 'Günlük ödül şu an alınamıyor. Lütfen tekrar deneyin.'
    };
  }

  // Aynı gün tekrar — iş kuralı, crash değil
  if (data?.code === 'DAILY_CLAIM_ALREADY_CLAIMED' || (response.ok && data?.ok === false)) {
    return {
      ok: false,
      alreadyClaimed: true,
      code: data?.code || 'DAILY_CLAIM_ALREADY_CLAIMED',
      error: data?.error || 'Günlük giriş ödülünü bugün zaten aldın.'
    };
  }

  if (!response.ok || !data?.ok) {
    return {
      ok: false,
      error: data?.error || data?.message || 'Günlük ödül kaydedilemedi',
      code: data?.code || null
    };
  }

  return {
    ok: true,
    message: data.message,
    loyalty: data.loyalty,
    dailyClaims: data.dailyClaims
  };
}
