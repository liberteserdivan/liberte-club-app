import { STATUS, SERVICE, THRESHOLDS, ERROR_CODE, USER_MESSAGE, worstStatus, statusRequiresHuman } from './guardianConstants.js';
import { summarizeService, statusFromSummary } from './guardianMetrics.js';
import { readSafeModeSync } from './guardianSafeMode.js';

// Liberte Guardian — sağlık kontrolleri
// Tek sorumluluk: her servis için "healthy/degraded/incident/critical" üretmek.
// Aktif ölçümler (DB ping) + pasif metrik özetleri (latency/hata) birleştirilir.
// Hassas detay sızdırmaz; yalnızca durum + süre + güvenli ipuçları döner.

// DB ping'i kısa zaman sınırıyla yarıştır — bayat bağlantıda bloklanma yok
async function pingDatabase() {
  const startedAt = Date.now();
  const { getSql } = await import('../sql.js');
  const sql = getSql();
  if (!sql) {
    return { ok: false, durationMs: 0, status: STATUS.CRITICAL, errorCode: ERROR_CODE.DB_UNREACHABLE };
  }

  try {
    const ping = sql`SELECT 1 AS ok`.then(() => true).catch(() => false);
    const timeout = new Promise((resolve) => setTimeout(() => resolve('timeout'), THRESHOLDS.DB_HEALTH_TIMEOUT_MS));
    const result = await Promise.race([ping, timeout]);
    const durationMs = Date.now() - startedAt;

    if (result === 'timeout') {
      return { ok: false, durationMs, status: STATUS.CRITICAL, errorCode: ERROR_CODE.DB_TIMEOUT };
    }
    if (!result) {
      return { ok: false, durationMs, status: STATUS.CRITICAL, errorCode: ERROR_CODE.DB_UNREACHABLE };
    }

    // Süreye göre degraded/critical
    let status = STATUS.HEALTHY;
    if (durationMs >= THRESHOLDS.DB_PING_CRITICAL_MS) status = STATUS.INCIDENT;
    else if (durationMs >= THRESHOLDS.DB_PING_DEGRADED_MS) status = STATUS.DEGRADED;
    return { ok: true, durationMs, status };
  } catch {
    return { ok: false, durationMs: Date.now() - startedAt, status: STATUS.CRITICAL, errorCode: ERROR_CODE.DB_UNREACHABLE };
  }
}

// Tek bir servisin sağlık raporunu standart formatta üret
function buildServiceReport(service, { status, durationMs = null, errorCode = null, details = {} }) {
  const ok = status === STATUS.HEALTHY || status === STATUS.DEGRADED;
  return {
    ok,
    status,
    service,
    durationMs,
    ...(errorCode ? { errorCode } : {}),
    requiresHuman: statusRequiresHuman(status),
    details
  };
}

// DB sağlığı (aktif ping + pasif metrik)
export async function checkDb() {
  const ping = await pingDatabase();
  const summary = summarizeService(SERVICE.DB);
  const status = worstStatus(ping.status, statusFromSummary(summary));
  return buildServiceReport(SERVICE.DB, {
    status,
    durationMs: ping.durationMs,
    errorCode: ping.errorCode,
    details: { pingOk: ping.ok, p95Ms: summary.p95Ms, errorRate: round(summary.errorRate) }
  });
}

// Auth/login sağlığı (pasif metrik tabanlı + login yavaşlık eşiği)
export function checkAuth(service = SERVICE.LOGIN) {
  const summary = summarizeService(service);
  let status = statusFromSummary(summary);
  if (summary.p95Ms != null && summary.p95Ms >= THRESHOLDS.LOGIN_SLOW_MS) {
    status = worstStatus(status, STATUS.INCIDENT);
  }
  return buildServiceReport(service, {
    status,
    durationMs: summary.lastDurationMs,
    details: { p95Ms: summary.p95Ms, errorRate: round(summary.errorRate), lastRequestId: summary.lastRequestId }
  });
}

// QR sağlığı — imza yapılandırması + latency
export async function checkQr() {
  const { resolveQrSigningSecret } = await import('../qrToken.js');
  const signing = resolveQrSigningSecret();
  const summary = summarizeService(SERVICE.QR);
  let status = statusFromSummary(summary);
  if (!signing.secret) status = worstStatus(status, STATUS.CRITICAL);
  if (summary.p95Ms != null && summary.p95Ms >= THRESHOLDS.QR_SLOW_MS) {
    status = worstStatus(status, STATUS.INCIDENT);
  }
  return buildServiceReport(SERVICE.QR, {
    status,
    durationMs: summary.lastDurationMs,
    errorCode: signing.secret ? null : ERROR_CODE.QR_SIGNING_MISSING,
    details: { signingReady: Boolean(signing.secret), p95Ms: summary.p95Ms, timeoutCount: summary.timeoutCount }
  });
}

// LP/loyalty sağlığı — latency + timeout
export function checkLoyalty() {
  const summary = summarizeService(SERVICE.LOYALTY);
  let status = statusFromSummary(summary);
  if (summary.p95Ms != null && summary.p95Ms >= THRESHOLDS.LP_SLOW_MS) {
    status = worstStatus(status, STATUS.INCIDENT);
  }
  return buildServiceReport(SERVICE.LOYALTY, {
    status,
    durationMs: summary.lastDurationMs,
    details: { p95Ms: summary.p95Ms, timeoutCount: summary.timeoutCount, errorRate: round(summary.errorRate) }
  });
}

// Realtime sağlığı — yapılandırma + pasif metrik
export async function checkRealtime() {
  const { readSupabasePublicConfig } = await import('../supabasePublicConfig.js');
  const config = readSupabasePublicConfig();
  const summary = summarizeService(SERVICE.REALTIME);
  // Realtime opsiyoneldir; kapalıysa degraded sayılır (kritik değil)
  let status = config.enabled ? statusFromSummary(summary) : STATUS.DEGRADED;
  return buildServiceReport(SERVICE.REALTIME, {
    status,
    durationMs: summary.lastDurationMs,
    details: { enabled: config.enabled, errorRate: round(summary.errorRate) }
  });
}

// Config sağlığı — kritik env eksikse degraded/critical
export async function checkConfig() {
  const { resolveQrSigningSecret } = await import('../qrToken.js');
  const hasDbUrl = Boolean(String(process.env.DATABASE_URL || '').trim());
  const qrReady = Boolean(resolveQrSigningSecret().secret);
  let status = STATUS.HEALTHY;
  if (!hasDbUrl) status = STATUS.CRITICAL;
  else if (!qrReady) status = STATUS.DEGRADED;
  return buildServiceReport(SERVICE.CONFIG, {
    status,
    errorCode: hasDbUrl ? null : ERROR_CODE.CONFIG_INVALID,
    details: { databaseConfigured: hasDbUrl, qrSigningReady: qrReady }
  });
}

// Genel sağlık — tüm servisleri birleştir
export async function checkOverall() {
  const [db, qr, realtime, config] = await Promise.all([checkDb(), checkQr(), checkRealtime(), checkConfig()]);
  const login = checkAuth(SERVICE.LOGIN);
  const loyalty = checkLoyalty();
  const services = { db, login, qr, loyalty, realtime, config };

  const overall = worstStatus(...Object.values(services).map((s) => s.status));
  const safeMode = readSafeModeSync();

  return {
    ok: overall === STATUS.HEALTHY || overall === STATUS.DEGRADED,
    status: overall,
    requiresHuman: statusRequiresHuman(overall),
    safeMode: { enabled: safeMode.enabled, level: safeMode.level, reason: safeMode.reason },
    userMessage: overall === STATUS.HEALTHY ? null : USER_MESSAGE.SAFE_MODE,
    services
  };
}

// Servis adından sağlık kontrol fonksiyonunu çöz
export async function checkByService(service) {
  switch (service) {
    case SERVICE.DB: return checkDb();
    case SERVICE.AUTH:
    case SERVICE.LOGIN: return checkAuth(SERVICE.LOGIN);
    case SERVICE.QR: return checkQr();
    case SERVICE.LOYALTY: return checkLoyalty();
    case SERVICE.REALTIME: return checkRealtime();
    case SERVICE.CONFIG: return checkConfig();
    default: return checkOverall();
  }
}

function round(value) {
  return value == null ? null : Math.round(value * 100) / 100;
}
