import { apiJson, ADMIN_MEMBERS_REQUEST_OPTIONS, ADMIN_REQUEST_OPTIONS, readApiError } from '../lib/apiClient.js';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchMembers() {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { response, data } = await apiJson('/api/admin/members', {
      ...ADMIN_MEMBERS_REQUEST_OPTIONS,
      skipUnauthorized: true
    });
    if (response.ok && data?.ok) return data;
    lastError = new Error(readApiError(data, 'Üye listesi alınamadı'));
    lastError.needsAdminPin = Boolean(data?.needsAdminPin);
    const retryable = response.status === 503 || data?.code === 'DATABASE_TRANSIENT';
    if (attempt < 2 && retryable) {
      await sleep(1500);
      continue;
    }
    throw lastError;
  }
  throw lastError;
}

export async function sendPush({ title, body, audience = 'all' }) {
  const { response, data } = await apiJson('/api/admin?resource=push-send', {
    ...ADMIN_REQUEST_OPTIONS,
    method: 'POST',
    body: JSON.stringify({ title, body, audience })
  });
  if (!response.ok || data?.ok === false) {
    throw new Error(readApiError(data, 'Bildirim gönderilemedi'));
  }
  return data;
}

export async function saveMenuState(patch) {
  const { response, data } = await apiJson('/api/state', {
    method: 'POST',
    body: JSON.stringify(patch),
    timeoutMs: 30000
  });
  if (!response.ok) throw new Error(readApiError(data, 'Menü kaydedilemedi'));
  return data;
}

export async function fetchHealth() {
  const { response, data } = await apiJson('/api/health', {
    method: 'GET',
    timeoutMs: 8000,
    skipUnauthorized: true,
    omitAuth: true
  });
  return { ok: response.ok, status: response.status, data };
}
