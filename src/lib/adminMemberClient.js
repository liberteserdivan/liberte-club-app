import { apiJson } from './apiClient.js';

// Yönetici — tüm üyeleri sunucudan çek
export async function fetchAdminMembersList() {
  const { response, data } = await apiJson('/api/admin/members', {
    timeoutMs: 60000
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

// Yönetici — üyeyi sunucudan sil
export async function deleteAdminMember(customerId) {
  const { response, data } = await apiJson('/api/admin?resource=member-delete', {
    method: 'POST',
    body: JSON.stringify({ customerId: Number(customerId) }),
    timeoutMs: 25000
  });
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || data?.message || 'Üye silinemedi');
  }
  return data;
}
