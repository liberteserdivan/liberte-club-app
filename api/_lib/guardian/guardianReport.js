import { REPORT_SEVERITY } from './guardianConstants.js';
import { getEvents, getMetricsSnapshot } from './guardianMetrics.js';
import { listIncidents } from './guardianIncidents.js';
import { readSafeModeSync } from './guardianSafeMode.js';
import { redactObject, redactText } from './mask.js';

// Liberte Guardian — incident raporu üretimi (bölüm 11)
// Tek sorumluluk: kopyalanabilir rapor metinleri üretmek (dosya yazmaz).
// Tüm çıktılar redact'ten geçer → secret/PII sızmaz.

// HEALTH_SNAPSHOT.json içeriği
export function buildHealthSnapshot(overall) {
  return redactObject({
    generatedAt: new Date().toISOString(),
    overall,
    safeMode: readSafeModeSync(),
    metrics: getMetricsSnapshot()
  });
}

// FAILED_REQUESTS.json — yalnızca başarısız/yavaş istekler
export function buildFailedRequests(limit = 50) {
  const events = getEvents(500).filter((e) => !e.ok || e.timeout);
  return redactObject(events.slice(-limit));
}

// CURSOR_FIX_PROMPT.md — Cursor'a verilecek düzeltme talimatı (PII/secret yok)
export function buildCursorFixPrompt(incident) {
  const lines = [
    '# Liberte Cursor Fix Prompt',
    '',
    'Aşağıdaki incident için güvenli bir düzeltme uygula. Büyük refactor yapma.',
    'Gerçek env/secret değerlerini asla yazdırma. Müşteri PII kullanma.',
    '',
    `## Incident: ${incident.title}`,
    `- Seviye: ${incident.level}`,
    `- Etkilenen alan: ${incident.affectedArea}`,
    `- requiresHuman: ${incident.requiresHuman}`,
    '',
    '## Belirtiler',
    ...(incident.symptoms || []).map((s) => `- ${s}`),
    '',
    '## Şüpheli kök nedenler',
    ...(incident.suspectedRootCauses || []).map((s) => `- ${s}`),
    '',
    '## İlgili dosyalar',
    ...(incident.relatedFiles || []).map((f) => `- ${f}`),
    '',
    '## Bot tarafından alınan güvenli aksiyonlar',
    ...(incident.safeActionsTaken || []).map((a) => `- ${a}`),
    '',
    '## İstenen düzeltme',
    '1. Kök nedeni doğrula (ölç, kanıtla).',
    '2. Minimal ve güvenli düzeltme uygula.',
    '3. İlgili test ekle veya güncelle.',
    '4. npm test ve npm run build çalıştır.',
    '',
    '## Kısıtlar',
    '- DB migration çalıştırma.',
    '- Müşteri verisi silme, LP puanı değiştirme.',
    '- Secret/env değiştirme, otomatik deploy yapma.'
  ];
  return redactText(lines.join('\n'));
}

// INCIDENT_REPORT.md — tam rapor (bölüm 11 formatı)
export function buildIncidentReport(incident, overall) {
  const severity = REPORT_SEVERITY[incident.level] || 'Medium';
  const snapshot = getMetricsSnapshot();
  const lines = [
    '# Liberte Incident Report',
    '',
    '## Summary',
    `${incident.title} — ${incident.affectedArea} alanında ${incident.level} seviyesinde olay.`,
    `Incident ID: ${incident.id}`,
    '',
    '## Severity',
    severity,
    '',
    '## Affected Areas',
    `- ${incident.affectedArea}`,
    '',
    '## Timeline',
    `- Başlangıç: ${incident.startedAt}`,
    `- Son belirti: ${incident.lastSeenAt}`,
    `- Tekrar sayısı: ${incident.occurrences || 1}`,
    '',
    '## Evidence',
    `- Genel durum: ${overall?.status || 'unknown'}`,
    `- API hata sayaçları: ${JSON.stringify(snapshot.counters)}`,
    ...(incident.symptoms || []).map((s) => `- ${s}`),
    '',
    '## Suspected Root Causes',
    ...(incident.suspectedRootCauses || []).map((s) => `- ${s}`),
    '',
    '## Related Files',
    ...(incident.relatedFiles || []).map((f) => `- ${f}`),
    '',
    '## Safe Actions Taken',
    ...(incident.safeActionsTaken || []).map((a) => `- ${a}`),
    '',
    '## Recommended Fix',
    incident.recommendedAction || 'Cursor fix prompt üretildi.',
    '',
    '## Cursor Prompt',
    '```',
    buildCursorFixPrompt(incident),
    '```'
  ];
  return redactText(lines.join('\n'));
}

// En son açık incident için tam rapor paketi üret
export function buildReportBundle(overall, incidentId = null) {
  const open = listIncidents({ status: 'open', limit: 50 });
  const incident = incidentId
    ? open.find((i) => i.id === incidentId) || open[0]
    : open[0];

  if (!incident) {
    return {
      ok: false,
      message: 'Açık incident yok — rapor üretilmedi.',
      healthSnapshot: buildHealthSnapshot(overall)
    };
  }

  return {
    ok: true,
    incident,
    incidentReportMd: buildIncidentReport(incident, overall),
    cursorFixPromptMd: buildCursorFixPrompt(incident),
    healthSnapshot: buildHealthSnapshot(overall),
    failedRequests: buildFailedRequests(50)
  };
}
