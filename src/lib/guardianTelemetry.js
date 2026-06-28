import { isNativeApp, isIos, isAndroid } from './platform.js';

// Liberte Guardian — istemci telemetrisi (memory ring buffer)
// Tek sorumluluk: son API çağrılarının özetini bellekte tutmak (son 100).
// Sunucuya her istekte gönderilmez; admin paneli ve hata teşhisinde kullanılır.

const MAX_SAMPLES = 100;
const samples = [];
const counters = { total: 0, error: 0, timeout: 0, networkError: 0 };

// Aktif kullanıcı rolü — App, oturum değişince setGuardianRole ile günceller
let currentRole = 'anonymous';

// Telemetri için kullanıcı rolünü ayarla (anonymous/customer/admin)
export function setGuardianRole(role) {
  currentRole = role || 'anonymous';
}

// Platform etiketi
function detectPlatform() {
  if (!isNativeApp()) return 'web';
  if (isIos()) return 'ios';
  if (isAndroid()) return 'android';
  return 'native';
}

// Tek bir API çağrısını kaydet
export function recordRequest({
  endpoint,
  method = 'GET',
  durationMs = null,
  status = 0,
  timeout = false,
  networkError = false,
  requestId = null,
  userRole = null,
  safeMode = false
}) {
  const sample = {
    ts: Date.now(),
    endpoint: String(endpoint || '').split('?')[0].slice(0, 120),
    method: String(method || 'GET').toUpperCase(),
    durationMs: Number.isFinite(durationMs) ? Math.round(durationMs) : null,
    status: Number(status) || 0,
    ok: Number(status) ? Number(status) < 400 : !timeout && !networkError,
    timeout: Boolean(timeout),
    networkError: Boolean(networkError),
    requestId: requestId || null,
    platform: detectPlatform(),
    userRole: userRole || currentRole,
    safeMode: Boolean(safeMode)
  };

  samples.push(sample);
  if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);

  counters.total += 1;
  if (!sample.ok) counters.error += 1;
  if (sample.timeout) counters.timeout += 1;
  if (sample.networkError) counters.networkError += 1;

  // Geliştirme tanılaması — production'da gürültü yapmaması için yalnızca hatalarda
  if (!sample.ok) {
    console.info('[GUARDIAN]', {
      endpoint: sample.endpoint,
      status: sample.status,
      durationMs: sample.durationMs,
      requestId: sample.requestId,
      timeout: sample.timeout
    });
  }

  return sample;
}

// Son N örneği döndür (en yeni önce)
export function getRecentRequests(limit = 100) {
  return samples.slice(-limit).reverse();
}

// Özet sayaçlar
export function getTelemetrySummary() {
  return {
    ...counters,
    errorRate: counters.total ? counters.error / counters.total : 0,
    sampleCount: samples.length
  };
}

// Test/temizlik
export function resetTelemetry() {
  samples.length = 0;
  counters.total = 0;
  counters.error = 0;
  counters.timeout = 0;
  counters.networkError = 0;
}
