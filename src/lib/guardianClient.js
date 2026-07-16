import { apiJson, ADMIN_REQUEST_OPTIONS } from './apiClient.js';

// Liberte Guardian — istemci API istemcisi
// Tek sorumluluk: /api/guardian/* uçlarını çağırmak. Admin uçları kimlik
// doğrulamalıdır (credentials: 'include' ile cookie / Bearer gider).

// Temel (public) sağlık — hassas detay içermez
export async function fetchPublicHealth() {
  const { data } = await apiJson('/api/guardian/health', { method: 'GET' });
  return data;
}

// Detaylı sağlık (admin + PIN) — servis kırılımı, metrik, incident
export async function fetchDetailedHealth() {
  const { data } = await apiJson('/api/guardian/health?detailed=1', {
    method: 'GET',
    credentials: 'include',
    ...ADMIN_REQUEST_OPTIONS
  });
  return data;
}

// Belirli servis sağlığı
export async function fetchServiceHealth(service) {
  const { data } = await apiJson(`/api/guardian/health/${encodeURIComponent(service)}`, {
    method: 'GET',
    credentials: 'include',
    ...ADMIN_REQUEST_OPTIONS
  });
  return data;
}

// Incident listesi
export async function fetchIncidents() {
  const { data } = await apiJson('/api/guardian/incidents', {
    method: 'GET',
    credentials: 'include',
    ...ADMIN_REQUEST_OPTIONS
  });
  return data;
}

// Incident çöz
export async function resolveIncident(id) {
  const { data } = await apiJson('/api/guardian/incidents', {
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify({ action: 'resolve', id }),
    ...ADMIN_REQUEST_OPTIONS
  });
  return data;
}

// Safe Mode oku
export async function fetchSafeMode() {
  const { data } = await apiJson('/api/guardian/safe-mode', {
    method: 'GET',
    credentials: 'include',
    ...ADMIN_REQUEST_OPTIONS
  });
  return data;
}

// Safe Mode aç
export async function enableSafeMode({ reason = 'admin_manual', level = 'degraded', ttlMinutes = 60, features = {} } = {}) {
  const { data } = await apiJson('/api/guardian/safe-mode', {
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify({ enabled: true, reason, level, ttlMinutes, features }),
    ...ADMIN_REQUEST_OPTIONS
  });
  return data;
}

// Safe Mode kapat
export async function disableSafeMode() {
  const { data } = await apiJson('/api/guardian/safe-mode', {
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify({ enabled: false }),
    ...ADMIN_REQUEST_OPTIONS
  });
  return data;
}

// Incident raporu + Cursor prompt üret (kopyalanabilir metin)
export async function generateReport(incidentId = null) {
  const { data } = await apiJson('/api/guardian/report', {
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify({ incidentId }),
    ...ADMIN_REQUEST_OPTIONS
  });
  return data;
}

// Test uyarısı gönder
export async function sendTestAlert() {
  const { data } = await apiJson('/api/guardian/test-alert', {
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify({}),
    ...ADMIN_REQUEST_OPTIONS
  });
  return data;
}

// ---- Approval Autopilot: aksiyon önerileri (admin + PIN) ----

// Onay merkezi — bekleyen/onaylı/uygulanmış/reddedilmiş öneriler
export async function fetchActionCenter() {
  const { data } = await apiJson('/api/guardian/actions', {
    method: 'GET',
    credentials: 'include',
    ...ADMIN_REQUEST_OPTIONS
  });
  return data;
}

// Tek öneri detayı
export async function fetchAction(id) {
  const { data } = await apiJson(`/api/guardian/actions/${encodeURIComponent(id)}`, {
    method: 'GET',
    credentials: 'include',
    ...ADMIN_REQUEST_OPTIONS
  });
  return data;
}

// Öneriyi onayla ve uygula
export async function approveAction(id) {
  const { data } = await apiJson(`/api/guardian/actions/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify({}),
    ...ADMIN_REQUEST_OPTIONS
  });
  return data;
}

// Öneriyi reddet (uygulanmaz)
export async function rejectAction(id, note = '') {
  const { data } = await apiJson(`/api/guardian/actions/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify({ note }),
    ...ADMIN_REQUEST_OPTIONS
  });
  return data;
}

// Uygulanmış aksiyonu geri al (rollback)
export async function rollbackAction(id) {
  const { data } = await apiJson(`/api/guardian/actions/${encodeURIComponent(id)}/rollback`, {
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify({}),
    ...ADMIN_REQUEST_OPTIONS
  });
  return data;
}
