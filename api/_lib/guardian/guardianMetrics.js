import { SERVICE, STATUS, THRESHOLDS } from './guardianConstants.js';

// Liberte Guardian — metrik toplama (in-memory ring buffer)
// Tek sorumluluk: API/sağlık olaylarını sınırlı bir tamponda tutup özetlemek.
// NOT: Vercel'de her lambda instance kendi belleğini taşır (kalıcı değildir).
// v1 için bu kabul edilebilir; kalıcı çözüm scripts/sql/006_guardian.sql ile gelir.

const MAX_EVENTS = 500;

// Hot-reload ve modül tekrar yüklemelerinde tamponu koru
function store() {
  if (!globalThis.__liberteGuardianMetrics) {
    globalThis.__liberteGuardianMetrics = {
      events: [],
      counters: { 401: 0, 403: 0, 429: 0, 500: 0, 504: 0, timeout: 0, networkError: 0 }
    };
  }
  return globalThis.__liberteGuardianMetrics;
}

// Tek bir ölçüm olayını kaydet (en eski olaylar düşer)
export function recordEvent(event = {}) {
  const s = store();
  const row = {
    ts: Date.now(),
    service: event.service || SERVICE.API,
    endpoint: String(event.endpoint || '').slice(0, 120),
    method: String(event.method || 'GET').toUpperCase(),
    durationMs: Number.isFinite(event.durationMs) ? Math.round(event.durationMs) : null,
    status: Number(event.status) || 0,
    ok: event.ok !== false && (Number(event.status) ? Number(event.status) < 400 : true),
    timeout: Boolean(event.timeout),
    networkError: Boolean(event.networkError),
    requestId: event.requestId || null
  };

  s.events.push(row);
  if (s.events.length > MAX_EVENTS) s.events.splice(0, s.events.length - MAX_EVENTS);

  // Durum kodu sayaçlarını güncelle
  if (s.counters[row.status] != null) s.counters[row.status] += 1;
  if (row.timeout) s.counters.timeout += 1;
  if (row.networkError) s.counters.networkError += 1;

  return row;
}

// API ölçümü için kısa yol
export function recordApiSample(sample) {
  return recordEvent({ ...sample, service: sample.service || SERVICE.API });
}

// Son N olayı döndür (en yeni sonda)
export function getEvents(limit = 100) {
  const s = store();
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), MAX_EVENTS);
  return s.events.slice(-safeLimit);
}

// Belirli pencere içindeki olayları filtrele
function eventsInWindow(events, windowMs) {
  const cutoff = Date.now() - windowMs;
  return events.filter((e) => e.ts >= cutoff);
}

// Yüzdelik dilim hesapla (basit, sıralamaya dayalı)
export function percentile(values, p) {
  const list = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!list.length) return null;
  const idx = Math.min(list.length - 1, Math.floor((p / 100) * list.length));
  return list[idx];
}

// Bir endpoint parçasına göre son durum özeti
export function summarizeEndpoint(endpointFragment, { windowMs = THRESHOLDS.WINDOW_MS, service = null } = {}) {
  const s = store();
  const needle = String(endpointFragment || '').toLowerCase();
  const all = s.events.filter((e) => {
    if (service && e.service !== service) return false;
    return String(e.endpoint || '').toLowerCase().includes(needle);
  });
  const windowed = eventsInWindow(all, windowMs);
  const durations = windowed.map((e) => e.durationMs).filter((v) => Number.isFinite(v));
  const errors = windowed.filter((e) => !e.ok);
  const timeouts = windowed.filter((e) => e.timeout);
  const last = all[all.length - 1] || null;

  return {
    endpoint: endpointFragment,
    service: service || null,
    sampleCount: windowed.length,
    errorCount: errors.length,
    errorRate: windowed.length ? errors.length / windowed.length : 0,
    timeoutCount: timeouts.length,
    p95Ms: percentile(durations, 95),
    avgMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    lastStatus: last?.status ?? null,
    lastRequestId: last?.requestId ?? null,
    lastDurationMs: last?.durationMs ?? null,
    lastSeenAt: last ? new Date(last.ts).toISOString() : null
  };
}

// Bir servisin son durum özetini çıkar
export function summarizeService(service, { windowMs = THRESHOLDS.WINDOW_MS } = {}) {
  const s = store();
  const all = service ? s.events.filter((e) => e.service === service) : s.events;
  const windowed = eventsInWindow(all, windowMs);
  const durations = windowed.map((e) => e.durationMs).filter((v) => Number.isFinite(v));
  const errors = windowed.filter((e) => !e.ok);
  const timeouts = windowed.filter((e) => e.timeout);
  const last = all[all.length - 1] || null;

  return {
    service,
    sampleCount: windowed.length,
    errorCount: errors.length,
    errorRate: windowed.length ? errors.length / windowed.length : 0,
    timeoutCount: timeouts.length,
    p95Ms: percentile(durations, 95),
    avgMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    lastStatus: last?.status ?? null,
    lastRequestId: last?.requestId ?? null,
    lastDurationMs: last?.durationMs ?? null,
    lastSeenAt: last ? new Date(last.ts).toISOString() : null
  };
}

// Bir endpoint için son ölçümlerin durations dizisini döndür (kural değerlendirmesi)
export function recentDurations(service, { count = 10 } = {}) {
  const s = store();
  const list = s.events.filter((e) => e.service === service).slice(-count);
  return list.map((e) => ({ durationMs: e.durationMs, timeout: e.timeout, status: e.status }));
}

// Genel metrik anlık görüntüsü (rapor/admin paneli için)
export function getMetricsSnapshot() {
  const s = store();
  return {
    counters: { ...s.counters },
    totalEvents: s.events.length,
    services: Object.values(SERVICE).reduce((acc, svc) => {
      acc[svc] = summarizeService(svc);
      return acc;
    }, {})
  };
}

// Test/temizlik için tamponu sıfırla
export function resetMetrics() {
  globalThis.__liberteGuardianMetrics = undefined;
}

// Bir servis özetinden sağlık seviyesi türet (basit kural)
export function statusFromSummary(summary) {
  if (!summary || !summary.sampleCount) return STATUS.HEALTHY;
  if (summary.timeoutCount >= THRESHOLDS.WINDOW_TIMEOUT_COUNT) return STATUS.CRITICAL;
  if (summary.errorRate >= 0.5) return STATUS.CRITICAL;
  if (summary.errorRate >= THRESHOLDS.API_ERROR_RATE_DEGRADED) return STATUS.INCIDENT;
  if (summary.p95Ms != null && summary.p95Ms >= THRESHOLDS.API_P95_DEGRADED_MS) return STATUS.DEGRADED;
  return STATUS.HEALTHY;
}
