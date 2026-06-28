import { requireAdminSession } from '../auth.js';
import { STATUS, SERVICE, USER_MESSAGE } from '../guardian/guardianConstants.js';
import { checkOverall, checkByService } from '../guardian/guardianHealth.js';
import { evaluateAndIntervene } from '../guardian/guardianRules.js';
import {
  readSafeModeSync, enableSafeMode, disableSafeMode
} from '../guardian/guardianSafeMode.js';
import {
  listIncidents, recordIncident, resolveIncident
} from '../guardian/guardianIncidents.js';
import { raiseAlert, raiseResolvedAlert, sendTestAlert, listAlerts } from '../guardian/guardianAlerts.js';
import { buildReportBundle, buildHealthSnapshot } from '../guardian/guardianReport.js';
import { getMetricsSnapshot, getEvents } from '../guardian/guardianMetrics.js';
import { readBodySafe } from '../http.js';

// Liberte Guardian — HTTP yönlendiricisi
// Tek sorumluluk: guardian resource'larını uygun yetki ile servis etmek.
// Public: yalnızca temel health. Diğer her şey admin + admin PIN gerektirir.

// Standart yanıt zarfı (bölüm 2 formatı)
function envelope(res, statusCode, body) {
  return res.status(statusCode).json({
    requestId: res.req?.requestId || null,
    timestamp: new Date().toISOString(),
    ...body
  });
}

// resource ve alt-segmenti hem path hem query'den çöz
function resolveRoute(req) {
  // Rewrite ile gelen: ?resource=health&service=db
  const resource = String(req.query?.resource || '').trim().toLowerCase();
  const service = String(req.query?.service || '').trim().toLowerCase();
  if (resource) return { resource, service };

  // Doğrudan path: /api/guardian/health/db
  const path = String(req.url || '').split('?')[0].toLowerCase();
  const parts = path.replace(/^\/api\/guardian\/?/, '').split('/').filter(Boolean);
  return { resource: parts[0] || 'health', service: parts[1] || '' };
}

// Admin + PIN doğrulaması (light: ağır müşteri sync atlanır)
async function requireAdmin(req, res) {
  return requireAdminSession(req, res, { pinRequired: true, light: true });
}

// Temel (public) health — yalnızca durum, hassas detay yok
async function handlePublicHealth(req, res) {
  const overall = await checkOverall();
  return envelope(res, overall.ok ? 200 : 503, {
    ok: overall.ok,
    status: overall.status,
    service: 'overall',
    safeMode: overall.safeMode.enabled,
    userMessage: overall.userMessage
  });
}

// Detaylı health (admin) — servis kırılımı + otomatik müdahale değerlendirmesi
async function handleDetailedHealth(req, res, service) {
  // Önce güvenli otomatik aksiyonları değerlendir (best-effort)
  await evaluateAndIntervene().catch(() => {});

  if (service && service !== 'overall') {
    const report = await checkByService(service);
    return envelope(res, report.ok ? 200 : 503, report);
  }

  const overall = await checkOverall();
  return envelope(res, overall.ok ? 200 : 503, {
    ok: overall.ok,
    status: overall.status,
    service: 'overall',
    requiresHuman: overall.requiresHuman,
    safeMode: overall.safeMode,
    services: overall.services,
    metrics: getMetricsSnapshot(),
    incidents: listIncidents({ status: 'open', limit: 10 }),
    alerts: listAlerts(10)
  });
}

// GET/POST safe-mode
async function handleSafeMode(req, res) {
  if (req.method === 'GET') {
    return envelope(res, 200, { ok: true, service: 'safe-mode', safeMode: readSafeModeSync() });
  }
  const body = readBodySafe(req);
  if (body.enabled === false) {
    return envelope(res, 200, { ok: true, service: 'safe-mode', safeMode: disableSafeMode() });
  }
  const config = enableSafeMode({
    reason: body.reason || 'admin_manual',
    level: body.level || STATUS.DEGRADED,
    ttlMinutes: Number(body.ttlMinutes) || 60,
    features: body.features || {}
  });
  return envelope(res, 200, { ok: true, service: 'safe-mode', safeMode: config });
}

// GET/POST incidents
async function handleIncidents(req, res) {
  if (req.method === 'GET') {
    return envelope(res, 200, {
      ok: true,
      service: 'incidents',
      open: listIncidents({ status: 'open', limit: 50 }),
      resolved: listIncidents({ status: 'resolved', limit: 20 })
    });
  }

  const body = readBodySafe(req);
  // resolve isteği
  if (body.action === 'resolve' && body.id) {
    const inc = resolveIncident(body.id);
    if (inc) await raiseResolvedAlert(inc).catch(() => {});
    return envelope(res, 200, { ok: Boolean(inc), service: 'incidents', incident: inc });
  }

  // Manuel/istemci kaynaklı incident kaydı (telemetri özeti)
  const created = recordIncident({
    level: body.level || STATUS.INCIDENT,
    title: body.title || 'İstemci bildirimi',
    affectedArea: body.affectedArea || SERVICE.API,
    symptoms: Array.isArray(body.symptoms) ? body.symptoms : [],
    safeActionsTaken: Array.isArray(body.safeActionsTaken) ? body.safeActionsTaken : [],
    suspectedRootCauses: Array.isArray(body.suspectedRootCauses) ? body.suspectedRootCauses : [],
    relatedFiles: Array.isArray(body.relatedFiles) ? body.relatedFiles : []
  });
  if (created.requiresHuman) await raiseAlert(created).catch(() => {});
  return envelope(res, 201, { ok: true, service: 'incidents', incident: created });
}

// POST report — incident raporu + Cursor prompt üret (kopyalanabilir metin)
async function handleReport(req, res) {
  const overall = await checkOverall();
  const bundle = buildReportBundle(overall, readBodySafe(req)?.incidentId || null);
  return envelope(res, 200, { ok: bundle.ok, service: 'report', ...bundle });
}

// POST test-alert
async function handleTestAlert(req, res) {
  const result = await sendTestAlert();
  return envelope(res, 200, { ok: true, service: 'test-alert', alert: result.alert });
}

// GET metrics / events (admin)
async function handleMetrics(req, res) {
  return envelope(res, 200, {
    ok: true,
    service: 'metrics',
    metrics: getMetricsSnapshot(),
    events: getEvents(100)
  });
}

// Ana yönlendirici
export async function handleGuardian(req, res) {
  res.req = req; // envelope için requestId erişimi
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { resource, service } = resolveRoute(req);

  // PUBLIC: yalnızca temel health (servis belirtilmemiş GET)
  if (resource === 'health' && !service && req.method === 'GET' && req.query?.detailed !== '1') {
    return handlePublicHealth(req, res);
  }

  // Bundan sonrası admin + PIN gerektirir
  const session = await requireAdmin(req, res);
  if (!session) return undefined; // 401/403 zaten yazıldı

  switch (resource) {
    case 'health':
      return handleDetailedHealth(req, res, service);
    case 'incidents':
      return handleIncidents(req, res);
    case 'safe-mode':
    case 'safemode':
      return handleSafeMode(req, res);
    case 'report':
      return handleReport(req, res);
    case 'test-alert':
    case 'testalert':
      return handleTestAlert(req, res);
    case 'metrics':
      return handleMetrics(req, res);
    case 'snapshot':
      return envelope(res, 200, { ok: true, service: 'snapshot', snapshot: buildHealthSnapshot(await checkOverall()) });
    default:
      return envelope(res, 400, { ok: false, error: 'Geçersiz guardian resource', userMessage: USER_MESSAGE.SERVER_ERROR });
  }
}
