import { apiJson, ADMIN_MEMBERS_REQUEST_OPTIONS } from './apiClient.js';

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Tek sayfa üye listesi
async function fetchAdminMembersPage({ afterId = 0, limit = 200 } = {}) {
  let lastError = null;
  const qs = new URLSearchParams({
    afterId: String(afterId),
    limit: String(limit)
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { response, data } = await apiJson(`/api/admin/members?${qs}`, {
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

// Yönetici — tüm üyeleri keyset sayfalama ile çek
export async function fetchAdminMembersList() {
  const customers = [];
  const loyalty = {};
  let afterId = 0;
  let loyaltyDegraded = false;
  let lastTimings = null;
  let requestId = null;

  for (let page = 0; page < 50; page += 1) {
    const data = await fetchAdminMembersPage({ afterId, limit: 200 });
    customers.push(...(data.customers || []));
    Object.assign(loyalty, data.loyalty || {});
    loyaltyDegraded = loyaltyDegraded || Boolean(data.loyaltyDegraded);
    lastTimings = data.timings || lastTimings;
    requestId = data.requestId || requestId;
    if (!data.hasMore || data.nextCursor == null) break;
    afterId = Number(data.nextCursor) || afterId;
  }

  return {
    ok: true,
    customers,
    loyalty,
    count: customers.length,
    loyaltyDegraded,
    requestId,
    timings: lastTimings
  };
}

// Yönetici — manuel LP / ikram işlemi
export async function applyAdminMemberLoyalty({
  customerId,
  action = 'stamp',
  category = 'coffee',
  menuItemId = null,
  note = 'Admin manuel',
  idempotencyKey = null
}) {
  // Çift tıklama: istemci tek kullanım anahtarı üretir
  const key = String(idempotencyKey || (
    (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `m-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  )).slice(0, 120);

  const { response, data } = await apiJson('/api/admin?resource=member-loyalty', {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: JSON.stringify({
      customerId: Number(customerId),
      action,
      category,
      menuItemId,
      note,
      idempotencyKey: key
    }),
    timeoutMs: 60000
  });

  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || data?.message || 'LP işlemi yapılamadı');
  }

  return data;
}

// Yönetici — toplu LP ekleme (telefon listesi)
export async function applyBulkAdminMemberLoyalty({
  phonesText = '',
  phones = null,
  category = 'coffee'
}) {
  const { response, data } = await apiJson('/api/admin?resource=member-loyalty-bulk', {
    method: 'POST',
    body: JSON.stringify({
      phonesText,
      phones,
      category
    }),
    timeoutMs: 120000
  });

  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || data?.message || 'Toplu LP işlemi yapılamadı');
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
