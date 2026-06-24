import { apiJson, ADMIN_REQUEST_OPTIONS } from './apiClient.js';

const LOYALTY_FETCH_OPTIONS = { timeoutMs: 8_000 };

// Arka plan sync — ağ hatasında toast tetikleme
async function safeRealtimeRequest(path, options = {}) {
  try {
    return await apiJson(path, options);
  } catch {
    return { response: { ok: false, status: 0 }, data: { ok: false } };
  }
}

// Geçici ağ/DB hatasında bir kez daha dene
async function safeRealtimeRequestWithRetry(path, options = {}) {
  const first = await safeRealtimeRequest(path, options);
  if (first.response.ok && first.data?.ok) return first;
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
