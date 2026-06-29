import { apiJson } from './apiClient.js';

// Yönetici — tüm üyeleri sunucudan çek.
// Sunucu artık fail-fast (~6-12sn) döndüğü için 60sn client timeout gereksiz;
// 12sn ile sınırlanır, böylece UI uzun süre asılı kalmaz.
export async function fetchAdminMembersList() {
  const { response, data } = await apiJson('/api/admin/members', {
    timeoutMs: 12000
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

// Yönetici — manuel LP / ikram işlemi
export async function applyAdminMemberLoyalty({
  customerId,
  action = 'stamp',
  category = 'coffee',
  menuItemId = null,
  note = 'Admin manuel'
}) {
  const { response, data } = await apiJson('/api/admin?resource=member-loyalty', {
    method: 'POST',
    body: JSON.stringify({
      customerId: Number(customerId),
      action,
      category,
      menuItemId,
      note
    }),
    timeoutMs: 60000
  });

  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || data?.message || 'LP işlemi yapılamadı');
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
