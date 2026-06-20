import { apiJson } from './apiClient.js';

// Realtime tetikleyici sonrası hafif loyalty snapshot
export async function fetchCustomerLoyaltySnapshot() {
  const { response, data } = await apiJson('/api/realtime?resource=customer-loyalty');
  if (!response.ok || !data?.ok) return null;
  return data.loyalty || null;
}

// Son LP işlemleri
export async function fetchCustomerHistory(limit = 20) {
  const { response, data } = await apiJson(`/api/realtime?resource=customer-history&limit=${limit}`);
  if (!response.ok || !data?.ok) return null;
  return data.history || [];
}

// Uygulama içi bildirimler
export async function fetchCustomerNotifications() {
  const { response, data } = await apiJson('/api/realtime?resource=customer-notifications');
  if (!response.ok || !data?.ok) return null;
  return data.notifications || [];
}

// Kampanya/kupon dilimi
export async function fetchPromoSlice() {
  const { response, data } = await apiJson('/api/realtime?resource=promos');
  if (!response.ok || !data?.ok) return null;
  return {
    campaigns: data.campaigns || [],
    coupons: data.coupons || [],
    dailyCampaign: data.dailyCampaign || null
  };
}

// Admin dashboard feed
export async function fetchAdminFeed() {
  const { response, data } = await apiJson('/api/realtime?resource=admin-feed');
  if (!response.ok || !data?.ok) return null;
  return data;
}
