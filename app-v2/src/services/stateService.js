import { apiJson } from '../lib/apiClient.js';

// Minimal bootstrap — tam dump değil
export async function fetchAppState() {
  const { response, data } = await apiJson('/api/state', {
    method: 'GET',
    timeoutMs: 25000,
    skipUnauthorized: true
  });
  if (!response.ok) {
    const err = new Error(data?.error || 'Durum alınamadı');
    err.httpStatus = response.status;
    throw err;
  }
  return data;
}

export function pickCustomer(state, customerId) {
  const list = state?.customers || [];
  return list.find((c) => Number(c.id) === Number(customerId)) || null;
}

export function pickLoyalty(state, customerId) {
  const map = state?.loyalty || {};
  return map[customerId] || map[String(customerId)] || null;
}

export function getLpBalance(loyalty) {
  if (!loyalty) return 0;
  return Number(loyalty.lp ?? loyalty.points ?? loyalty.balance ?? 0) || 0;
}
