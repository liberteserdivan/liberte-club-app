import { apiJson, ADMIN_REQUEST_OPTIONS } from './apiClient.js';
import { canAttempt, recordSuccess, recordFailure } from './backgroundCircuit.js';
import { isRealtimeDisabledByFlag } from './safeMode.js';

// Müşteri realtime fetch'leri kısa zaman aşımıyla yapılır — 90-120sn asılı kalmaz.
const REALTIME_FETCH_OPTIONS = { timeoutMs: 6_000, retryTransient: false };
const LOYALTY_FETCH_OPTIONS = REALTIME_FETCH_OPTIONS;
const REALTIME_CIRCUIT_KEY = 'realtime';
const FAILED_RESULT = Object.freeze({ response: { ok: false, status: 0 }, data: { ok: false } });

// Aynı uç için aynı anda yalnızca bir istek — pending varken ikincisi onu paylaşır
const inflightRealtime = new Map();

// Arka plan sync — ağ hatasında toast tetikleme + devre kesici
async function safeRealtimeRequest(path, options = {}) {
  // VITE_DISABLE_REALTIME=true → hiçbir realtime isteği gönderilmez (sert kill switch)
  if (isRealtimeDisabledByFlag()) return FAILED_RESULT;
  // Devre açıksa (3 ardışık hata) yeni istek başlatma — retry storm engeli
  if (!canAttempt(REALTIME_CIRCUIT_KEY)) return FAILED_RESULT;

  // Pending istek varsa onu paylaş (in-flight dedup)
  const existing = inflightRealtime.get(path);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const result = await apiJson(path, { ...REALTIME_FETCH_OPTIONS, ...options });
      if (result.response.ok) recordSuccess(REALTIME_CIRCUIT_KEY);
      else recordFailure(REALTIME_CIRCUIT_KEY);
      return result;
    } catch {
      recordFailure(REALTIME_CIRCUIT_KEY);
      return FAILED_RESULT;
    } finally {
      inflightRealtime.delete(path);
    }
  })();

  inflightRealtime.set(path, promise);
  return promise;
}

// Geçici ağ/DB hatasında bir kez daha dene (devre açık değilse)
async function safeRealtimeRequestWithRetry(path, options = {}) {
  const first = await safeRealtimeRequest(path, options);
  if (first.response.ok && first.data?.ok) return first;
  if (!canAttempt(REALTIME_CIRCUIT_KEY)) return first;
  await new Promise((resolve) => setTimeout(resolve, 350));
  return safeRealtimeRequest(path, options);
}

// Realtime tetikleyici sonrası hafif loyalty snapshot
export async function fetchCustomerLoyaltySnapshot() {
  const { response, data } = await safeRealtimeRequestWithRetry(
    '/api/realtime?resource=customer-loyalty',
    LOYALTY_FETCH_OPTIONS
  );
  if (!response.ok || !data?.ok) return null;
  return data.loyalty || null;
}

// Son LP işlemleri
export async function fetchCustomerHistory(limit = 20) {
  const { response, data } = await safeRealtimeRequest(`/api/realtime?resource=customer-history&limit=${limit}`);
  if (!response.ok || !data?.ok) return null;
  return data.history || [];
}

// Uygulama içi bildirimler
export async function fetchCustomerNotifications() {
  const { response, data } = await safeRealtimeRequest('/api/realtime?resource=customer-notifications');
  if (!response.ok || !data?.ok) return null;
  return data.notifications || [];
}

// Kampanya/kupon dilimi
export async function fetchPromoSlice() {
  const { response, data } = await safeRealtimeRequest('/api/realtime?resource=promos');
  if (!response.ok || !data?.ok) return null;
  return {
    campaigns: data.campaigns || [],
    coupons: data.coupons || [],
    dailyCampaign: data.dailyCampaign || null
  };
}

// Admin dashboard feed — hata fırlatır
export async function fetchAdminFeed() {
  // Bayrak açıkken admin realtime feed de devre dışı
  if (isRealtimeDisabledByFlag()) throw new Error('realtime_disabled');
  const { response, data } = await apiJson('/api/realtime?resource=admin-feed', {
    ...ADMIN_REQUEST_OPTIONS
  });
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || data?.message || 'Admin özeti alınamadı');
  }
  return data;
}

// Admin üye listesi — yönetici sync için (hata fırlatır)
export async function fetchAdminCustomersStrict() {
  // Bayrak açıkken admin-customers realtime fetch'i de devre dışı (snapshot/full-state fallback devreye girer)
  if (isRealtimeDisabledByFlag()) throw new Error('realtime_disabled');
  const { response, data } = await apiJson('/api/realtime?resource=admin-customers', {
    timeoutMs: 45000
  });
  if (!response.ok || !data?.ok) {
    const message = data?.error || data?.message || 'Üye listesi alınamadı';
    const error = new Error(message);
    error.httpStatus = response.status;
    error.needsAdminPin = Boolean(data?.needsAdminPin);
    throw error;
  }
  return data;
}

// Admin üye listesi — hafif endpoint
export async function fetchAdminCustomers() {
  try {
    return await fetchAdminCustomersStrict();
  } catch {
    return null;
  }
}
