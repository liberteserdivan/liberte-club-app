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
import { shouldAutoAlertForIncident } from '../guardian/guardianAutoReport.js';
import { buildReportBundle, buildHealthSnapshot } from '../guardian/guardianReport.js';
import { getMetricsSnapshot, getEvents } from '../guardian/guardianMetrics.js';
import {
  proposeAction, approveAction, rejectAction, executeApprovedAction,
  rollbackAction, listApprovalCenter
} from '../guardian/guardianApprovals.js';
import { getProposal } from '../guardian/guardianActionProposals.js';
import { readBodySafe } from '../http.js';

// Liberte Guardian — HTTP yönlendiricisi
// Tek sorumluluk: guardian resource'larını uygun yetki ile servis etmek.
// Public: yalnızca temel health. Diğer her şey admin + admin PIN gerektirir.

// Guardian health hiçbir koşulda Vercel fonksiyon limitine (504) düşmemeli.
// Bu süre içinde dönmezse "degraded" özet döneriz; UI takılmaz, kart yeşil kalmaz.
const HEALTH_DEADLINE_MS = 8000;

// Bir health işini zaman sınırıyla yarıştır — süre dolarsa fallback değer döner
function withHealthDeadline(promise, fallback) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(fallback);
    }, HEALTH_DEADLINE_MS);
    Promise.resolve(promise)
      .then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(fallback);
      });
  });
}

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
  return requireAdminSession(req, res, { light: true });
}

// Guardian kendi yavaşlığında bile UI'yı bloklamasın — degraded fallback özeti
const DEGRADED_OVERALL_FALLBACK = Object.freeze({
  ok: false,
  status: STATUS.DEGRADED,
  requiresHuman: false,
  safeMode: { enabled: false, level: STATUS.DEGRADED, reason: 'health_timeout' },
  userMessage: USER_MESSAGE.SAFE_MODE,
  services: {}
});

// Temel (public) health — yalnızca durum, hassas detay yok
async function handlePublicHealth(req, res) {
  const overall = await withHealthDeadline(checkOverall(), DEGRADED_OVERALL_FALLBACK);
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
  // Önce güvenli otomatik aksiyonları değerlendir (best-effort, deadline ile)
  await withHealthDeadline(evaluateAndIntervene().catch(() => {}), null);

  if (service && service !== 'overall') {
    const report = await withHealthDeadline(checkByService(service), {
      ok: false, status: STATUS.DEGRADED, service, durationMs: HEALTH_DEADLINE_MS
    });
    return envelope(res, report.ok ? 200 : 503, report);
  }

  const overall = await withHealthDeadline(checkOverall(), DEGRADED_OVERALL_FALLBACK);
  return envelope(res, overall.ok ? 200 : 503, {
    ok: overall.ok,
    status: overall.status,
    service: 'overall',
    requiresHuman: overall.requiresHuman,
    safeMode: overall.safeMode,
    services: overall.services,
    metrics: getMetricsSnapshot(),
    incidents: listIncidents({ status: 'open', limit: 10 }),
    alerts: listAlerts(10),
    // Approval Autopilot — onay merkezi (bekleyen/uygulanmış/insan gereken öneriler)
    actions: listApprovalCenter()
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
  if (shouldAutoAlertForIncident(created)) await raiseAlert(created).catch(() => {});
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

// Action id + op'u query (rewrite) veya path'ten çöz
function resolveActionTarget(req) {
  let id = String(req.query?.actionId || '').trim();
  let op = String(req.query?.op || '').trim().toLowerCase();
  if (!id || !op) {
    // /api/guardian/actions/:id/:op path fallback
    const path = String(req.url || '').split('?')[0];
    const parts = path.replace(/^\/api\/guardian\/actions\/?/i, '').split('/').filter(Boolean);
    if (!id && parts[0] && parts[0] !== 'propose') id = parts[0];
    if (!op) op = parts[1] ? parts[1].toLowerCase() : (parts[0] === 'propose' ? 'propose' : '');
  }
  return { id, op };
}

// Approval Autopilot — öneri yaşam döngüsü (bölüm 6). Hepsi admin + PIN gerektirir.
async function handleActions(req, res, session) {
  const { id, op } = resolveActionTarget(req);
  const adminId = session?.customerId ?? session?.id ?? null;
  const requestId = req.requestId || null;

  if (req.method === 'GET') {
    if (id) {
      const proposal = getProposal(id);
      return envelope(res, proposal ? 200 : 404, { ok: Boolean(proposal), service: 'actions', proposal });
    }
    return envelope(res, 200, { ok: true, service: 'actions', ...listApprovalCenter() });
  }

  // POST işlemleri
  const body = readBodySafe(req);

  if (op === 'propose') {
    const result = await proposeAction(body, { autoExecute: true });
    return envelope(res, result.ok === false ? 200 : 201, { service: 'actions', ...result });
  }

  if (!id) {
    return envelope(res, 400, { ok: false, error: 'Action id gerekli', userMessage: USER_MESSAGE.SERVER_ERROR });
  }

  switch (op) {
    case 'approve': {
      const result = await approveAction(id, { adminId, requestId });
      return envelope(res, result.ok ? 200 : 409, { service: 'actions', ...result });
    }
    case 'reject': {
      const result = rejectAction(id, { adminId, note: body.note, requestId });
      return envelope(res, result.ok ? 200 : 409, { service: 'actions', ...result });
    }
    case 'execute': {
      const result = executeApprovedAction(id, { adminId, requestId });
      return envelope(res, result.ok ? 200 : 409, { service: 'actions', ...result });
    }
    case 'rollback': {
      const result = rollbackAction(id, { adminId, requestId });
      return envelope(res, result.ok ? 200 : 409, { service: 'actions', ...result });
    }
    default:
      return envelope(res, 400, { ok: false, error: 'Geçersiz action işlemi', userMessage: USER_MESSAGE.SERVER_ERROR });
  }
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

// Cron isteğinin yetkili olup olmadığını doğrula.
// Vercel cron, CRON_SECRET tanımlıysa onu "Authorization: Bearer <secret>"
// başlığıyla gönderir. Secret tanımlı değilse (yapılandırma eksik) güvenli tarafta
// kalmak için reddederiz — autopilot herkese açık tetiklenemez.
function isAuthorizedCron(req) {
  const secret = String(process.env.CRON_SECRET || '').trim();
  if (!secret) return false;
  const auth = String(req.headers?.authorization || '').trim();
  return auth === `Bearer ${secret}`;
}

// GET cron — bot'u PERIYODIK tetikler (Vercel Cron). Admin oturumu yerine
// CRON_SECRET ile yetkilendirilir. Aktif sağlık kontrolü + güvenli otomatik
// müdahale değerlendirmesi yapar (admin detaylı health görünümüyle aynı iş).
async function handleCron(req, res) {
  if (!isAuthorizedCron(req)) {
    return envelope(res, 401, { ok: false, service: 'cron', error: 'Yetkisiz' });
  }
  await withHealthDeadline(evaluateAndIntervene().catch(() => {}), null);
  const overall = await withHealthDeadline(checkOverall(), DEGRADED_OVERALL_FALLBACK);
  return envelope(res, 200, {
    ok: overall.ok,
    service: 'cron',
    status: overall.status,
    requiresHuman: overall.requiresHuman,
    safeMode: overall.safeMode,
    incidents: listIncidents({ status: 'open', limit: 10 })
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

  // CRON: Vercel Cron tetikler; admin oturumu yerine CRON_SECRET ile yetkilendirilir.
  if (resource === 'cron') {
    return handleCron(req, res);
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
    case 'actions':
      return handleActions(req, res, session);
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
