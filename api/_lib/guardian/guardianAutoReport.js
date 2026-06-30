import { STATUS } from './guardianConstants.js';
import { buildCursorFixPrompt, buildIncidentReport } from './guardianReport.js';
import { getMetricsSnapshot } from './guardianMetrics.js';
import { readSafeModeSync } from './guardianSafeMode.js';

// Liberte Guardian — Faz 2: otomatik incident raporu
// Tek sorumluluk: incident kaydı/güncellemesinde Cursor prompt + rapor üretip
// incident nesnesine eklemek. Dosya yazmaz; DB persist incident.data üzerinden gider.

const MAX_REPORT_CHARS = 24000;

// Minimal overall durumu — rapor üretimi için yeterli
function buildOverallStub() {
  const metrics = getMetricsSnapshot();
  const safeMode = readSafeModeSync();
  let status = STATUS.HEALTHY;
  if (safeMode.enabled) status = safeMode.level || STATUS.DEGRADED;
  if ((metrics?.counters?.timeout || 0) >= 3) status = STATUS.INCIDENT;
  return { status, safeMode: Boolean(safeMode.enabled) };
}

// Incident'a otomatik rapor paketi ekle (dedup: occurrences değişmediyse atla)
export function attachAutoReportToIncident(incident, { force = false } = {}) {
  if (!incident?.id) return null;

  const prev = incident.autoReport;
  if (!force && prev?.occurrencesAt === incident.occurrences && prev?.cursorFixPromptMd) {
    return prev;
  }

  const overall = buildOverallStub();
  const cursorFixPromptMd = buildCursorFixPrompt(incident).slice(0, MAX_REPORT_CHARS);
  const incidentReportMd = buildIncidentReport(incident, overall).slice(0, MAX_REPORT_CHARS);

  incident.autoReport = {
    generatedAt: new Date().toISOString(),
    occurrencesAt: incident.occurrences || 1,
    cursorFixPromptMd,
    incidentReportMd,
    ready: true
  };

  return incident.autoReport;
}

// Alert tetiklenecek mi? (incident/critical her zaman; degraded seyrek)
export function shouldAutoAlertForIncident(incident) {
  if (!incident?.id) return false;
  if (incident.level === STATUS.CRITICAL || incident.level === STATUS.INCIDENT) return true;
  if (incident.level === STATUS.DEGRADED) return (incident.occurrences || 1) >= 3;
  return Boolean(incident.requiresHuman);
}