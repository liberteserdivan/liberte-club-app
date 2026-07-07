import { apiJson, ADMIN_MEMBERS_REQUEST_OPTIONS } from './apiClient.js';

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Yönetici — tüm üyeleri sunucudan çek (503 için tek retry).
export async function fetchAdminMembersList() {
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { response, data } = await apiJson('/api/admin/members', {
      ...ADMIN_MEMBERS_REQUEST_OPTIONS,
      skipUnauthorized: true
    });

    if (response.ok && data?.ok) {
      return data;
    }

    const message = data?.error || data?.message || 'Üye listesi alınamadı';
    const error = new Error(message);
    error.httpStatus = response.status;
    error.code = data?.code || null;
    error.requestId = data?.requestId || null;
    error.step = data?.step || null;
    error.needsAdminPin = Boolean(data?.needsAdminPin);
    error.timings = data?.timings || null;
    lastError = error;

    const retryable = response.status === 503
      || data?.code === 'ADMIN_MEMBERS_TEMPORARILY_UNAVAILABLE'
      || data?.code === 'DATABASE_TRANSIENT';
    if (attempt < 2 && retryable) {
      await sleep(2000);
      continue;
    }
    throw error;
  }

  throw lastError || new Error('Üye listesi alınamadı');
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
