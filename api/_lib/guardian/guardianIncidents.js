import { STATUS, SERVICE, statusRequiresHuman } from './guardianConstants.js';
import { redactText } from './mask.js';
import { persistIncidentToDb } from './guardianStore.js';
import { attachAutoReportToIncident } from './guardianAutoReport.js';
import { proposeAiFixForIncident, dismissAiFixForResolvedIncident } from './guardianAiFix.js';

// Liberte Guardian — incident kayıt sistemi (in-memory)
// Tek sorumluluk: olayları seviyelere ayırıp dedup ile tek kayıtta toplamak.
// Aynı (alan + başlık anahtarı) için yeni kayıt açmaz; mevcut incident güncellenir.
// NOT: Bellek + DB (guardianStore). Tüm instance'lar hydrate ile senkron olur.

const MAX_INCIDENTS = 100;

function store() {
  if (!globalThis.__liberteGuardianIncidents) {
    globalThis.__liberteGuardianIncidents = { list: [], seq: 0 };
  }
  return globalThis.__liberteGuardianIncidents;
}

// Tarih → YYYYMMDD (incident id için)
function dayStamp(date = new Date()) {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`;
}

// Dedup anahtarı — aynı alan + aynı başlık tek incident'tır
function dedupKey(affectedArea, title) {
  return `${affectedArea}::${String(title || '').toLowerCase().trim()}`;
}

// Açık (open) ve aynı anahtarlı incident'ı bul
function findOpen(s, key) {
  return s.list.find((inc) => inc.status === 'open' && inc._key === key) || null;
}

// Yeni incident oluştur veya mevcut açık olanı güncelle (dedup + spam engeli)
export function recordIncident({
  level = STATUS.INCIDENT,
  title,
  affectedArea,
  symptoms = [],
  safeActionsTaken = [],
  suspectedRootCauses = [],
  relatedFiles = [],
  recommendedAction = ''
} = {}) {
  const s = store();
  const key = dedupKey(affectedArea, title);
  const nowIso = new Date().toISOString();
  const existing = findOpen(s, key);

  if (existing) {
    // Mevcut incident'ı güncelle — yeni kayıt açma (spam engeli)
    existing.lastSeenAt = nowIso;
    existing.occurrences += 1;
    // En kötü seviyeyi koru/yükselt
    if ((STATUS_RANK(level)) > (STATUS_RANK(existing.level))) existing.level = level;
    existing.symptoms = mergeUnique(existing.symptoms, symptoms);
    existing.safeActionsTaken = mergeUnique(existing.safeActionsTaken, safeActionsTaken);
    existing.suspectedRootCauses = mergeUnique(existing.suspectedRootCauses, suspectedRootCauses);
    existing.relatedFiles = mergeUnique(existing.relatedFiles, relatedFiles);
    if (recommendedAction) existing.recommendedAction = redactText(recommendedAction);
    existing.requiresHuman = statusRequiresHuman(existing.level);
    attachAutoReportToIncident(existing);
    void proposeAiFixForIncident(existing);
    void persistIncidentToDb(existing);
    return existing;
  }

  s.seq += 1;
  const incident = {
    id: `LBT-INC-${dayStamp()}-${String(s.seq).padStart(3, '0')}`,
    _key: key,
    level,
    status: 'open',
    title: redactText(title || 'Bilinmeyen sorun'),
    affectedArea: affectedArea || 'api',
    startedAt: nowIso,
    lastSeenAt: nowIso,
    occurrences: 1,
    symptoms: symptoms.map((x) => redactText(x)),
    safeActionsTaken: [...safeActionsTaken],
    requiresHuman: statusRequiresHuman(level),
    suspectedRootCauses: [...suspectedRootCauses],
    relatedFiles: [...relatedFiles],
    recommendedAction: redactText(recommendedAction)
  };

  attachAutoReportToIncident(incident);
  void proposeAiFixForIncident(incident);
  s.list.push(incident);
  if (s.list.length > MAX_INCIDENTS) s.list.splice(0, s.list.length - MAX_INCIDENTS);
  void persistIncidentToDb(incident);
  return incident;
}

// Incident alanı → sağlık raporu servis anahtarı
const AREA_TO_SERVICE = Object.freeze({
  [SERVICE.LOGIN]: SERVICE.LOGIN,
  [SERVICE.AUTH]: SERVICE.LOGIN,
  [SERVICE.QR]: SERVICE.QR,
  [SERVICE.REALTIME]: SERVICE.REALTIME,
  [SERVICE.CONFIG]: SERVICE.CONFIG,
  [SERVICE.PUSH]: SERVICE.PUSH,
  [SERVICE.DB]: SERVICE.DB,
  [SERVICE.LOYALTY]: SERVICE.LOYALTY
});

// Servis artık sağlıklıysa açık incident'ları otomatik kapat (manuel "Çözüldü" gereksinimini azaltır)
export function autoResolveRecoveredIncidents(serviceReports = {}) {
  const s = store();
  const resolved = [];

  for (const inc of s.list) {
    if (inc.status !== 'open') continue;
    const svcKey = AREA_TO_SERVICE[inc.affectedArea] || inc.affectedArea;
    const report = serviceReports[svcKey];
    if (!report || report.status !== STATUS.HEALTHY) continue;
    const closed = resolveIncident(inc.id);
    if (closed) resolved.push(closed);
  }

  return resolved;
}

// Açık incident'ı çözüldü olarak işaretle
export function resolveIncident(id) {
  const s = store();
  const inc = s.list.find((x) => x.id === id);
  if (!inc) return null;
  inc.status = 'resolved';
  inc.resolvedAt = new Date().toISOString();
  inc.requiresHuman = false;
  dismissAiFixForResolvedIncident(id);
  void persistIncidentToDb(inc);
  return inc;
}

// Incident listesini döndür (en yeni önce). Dahili _key alanı dışarı sızdırılmaz.
export function listIncidents({ status = null, limit = 50 } = {}) {
  const s = store();
  let list = s.list.slice().reverse();
  if (status) list = list.filter((inc) => inc.status === status);
  return list.slice(0, limit).map(publicView);
}

// Tek incident getir
export function getIncident(id) {
  const s = store();
  const inc = s.list.find((x) => x.id === id);
  return inc ? publicView(inc) : null;
}

// requiresHuman true olan açık critical/incident var mı?
export function hasOpenHumanIncident() {
  const s = store();
  return s.list.some((inc) => inc.status === 'open' && inc.requiresHuman);
}

// Dışa açık görünüm — dahili alanları (_key) çıkar
function publicView(inc) {
  const { _key, ...rest } = inc;
  return { ...rest };
}

// Dizileri benzersiz birleştir (sınırlı uzunluk)
function mergeUnique(base = [], extra = []) {
  const set = new Set([...(base || []), ...(extra || [])]);
  return Array.from(set).slice(0, 20);
}

// Seviye sıralaması (yerel, döngüsel import önlemek için)
function STATUS_RANK(level) {
  return { healthy: 0, degraded: 1, incident: 2, critical: 3 }[level] ?? 0;
}

// Test/temizlik
export function resetIncidents() {
  globalThis.__liberteGuardianIncidents = undefined;
}

// DB hydrate — açık incident'ları belleğe birleştir (dedup anahtarı korunur)
export function mergeIncidentsFromDb(rows = []) {
  const s = store();
  for (const row of rows) {
    if (!row?.id) continue;
    const key = row._key || dedupKey(row.affectedArea, row.title);
    const existing = s.list.find((inc) => inc.id === row.id || (inc.status === 'open' && inc._key === key));
    if (existing) {
      const remoteSeen = Date.parse(row.lastSeenAt || 0);
      const localSeen = Date.parse(existing.lastSeenAt || 0);
      if (remoteSeen >= localSeen) Object.assign(existing, row, { _key: key });
      continue;
    }
    s.list.push({ ...row, _key: key });
  }
  if (s.list.length > MAX_INCIDENTS) s.list.splice(0, s.list.length - MAX_INCIDENTS);
}
