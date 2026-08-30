import { STATUS } from './guardianConstants.js';
import { redactText } from './mask.js';

// Liberte Guardian — admin uyarı/bildirim sistemi
// Tek sorumluluk: bot çözemediği sorunlarda admin'e uyarı üretmek + spam'i engellemek.
// Kanallar: admin panel içi (bellek kuyruğu — her zaman) + e-posta (Resend, best-effort).
// NOT: Hiçbir secret/PII gönderilmez; metinler redactText'ten geçer.

const MAX_ALERTS = 50;
// Aynı incident için iki bildirim arası minimum süre (spam engeli)
const MIN_RESEND_MS = 5 * 60 * 1000;
// Critical devam ederse hatırlatma aralığı
const CRITICAL_REMIND_MS = 15 * 60 * 1000;

function store() {
  if (!globalThis.__liberteGuardianAlerts) {
    globalThis.__liberteGuardianAlerts = { list: [], lastSentByIncident: {} };
  }
  return globalThis.__liberteGuardianAlerts;
}

// Bu incident için şimdi bildirim göndermeli miyiz? (spam guard)
function shouldNotify(incidentId, level) {
  const s = store();
  const last = s.lastSentByIncident[incidentId];
  if (!last) return true;
  const elapsed = Date.now() - last;
  // Critical ise 15 dk'da bir hatırlat, değilse 5 dk içinde tekrar gönderme
  return level === STATUS.CRITICAL ? elapsed >= CRITICAL_REMIND_MS : elapsed >= MIN_RESEND_MS;
}

// Admin'e gösterilecek bildirim metnini formatla (bölüm 8 şablonu)
export function formatAlertText(incident) {
  const lines = [
    `🚨 Liberte ${incident.level === STATUS.CRITICAL ? 'Critical' : 'Incident'} Alert`,
    '',
    `Sorun: ${incident.title}`,
    `Seviye: ${incident.level}`,
    `Etkilenen alan: ${incident.affectedArea}`,
    `Başlangıç: ${incident.startedAt}`,
    `Son belirti: ${(incident.symptoms || [])[incident.symptoms.length - 1] || '—'}`,
    `Request ID: ${(incident.symptoms || []).find((x) => /LBT-/.test(x)) || incident.id}`,
    '',
    'Botun yaptığı:',
    ...(incident.safeActionsTaken?.length ? incident.safeActionsTaken.map((a) => `- ${a}`) : ['- (otomatik aksiyon yok)']),
    '',
    'Sonuç:',
    incident.requiresHuman ? 'Sorun devam ediyor. İnsan müdahalesi gerekiyor.' : 'Bot izlemeye devam ediyor.',
    '',
    'Hazırlandı (otomatik):',
    incident.autoReport?.ready ? '- CURSOR_FIX_PROMPT.md (incident kaydında)' : '- INCIDENT_REPORT.md',
    incident.autoReport?.ready ? '- INCIDENT_REPORT.md (incident kaydında)' : '- CURSOR_FIX_PROMPT.md'
  ];
  return redactText(lines.join('\n'));
}

// Best-effort e-posta — yalnızca RESEND yapılandırılmış ve hedef tanımlıysa
async function trySendEmail(subject, text) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.GUARDIAN_ALERT_EMAIL;
  const from = process.env.RESEND_FROM_EMAIL || 'Liberte Guardian <noreply@libertegastrocafe.com>';
  if (!apiKey || !to) return { sent: false, reason: 'not_configured' };

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, text }),
      signal: AbortSignal.timeout(8000)
    });
    return { sent: response.ok };
  } catch {
    return { sent: false, reason: 'send_failed' };
  }
}

// Bir incident için uyarı oluştur (spam guard'a uyar). channels best-effort.
export async function raiseAlert(incident, { force = false } = {}) {
  const s = store();
  if (!force && !shouldNotify(incident.id, incident.level)) {
    return { suppressed: true, reason: 'spam_guard' };
  }

  const text = formatAlertText(incident);
  const alert = {
    id: `ALERT-${Date.now()}`,
    incidentId: incident.id,
    level: incident.level,
    title: incident.title,
    text,
    createdAt: new Date().toISOString(),
    channels: { inApp: true, email: false }
  };

  // E-posta best-effort
  const email = await trySendEmail(`Liberte ${incident.level} — ${incident.title}`, text);
  alert.channels.email = Boolean(email.sent);

  s.list.push(alert);
  if (s.list.length > MAX_ALERTS) s.list.splice(0, s.list.length - MAX_ALERTS);
  s.lastSentByIncident[incident.id] = Date.now();

  return { suppressed: false, alert };
}

// Incident çözülünce "resolved" bildirimi
export async function raiseResolvedAlert(incident) {
  const s = store();
  const text = redactText(`✅ Liberte — "${incident.title}" çözüldü (${incident.affectedArea}).`);
  const alert = {
    id: `ALERT-${Date.now()}`,
    incidentId: incident.id,
    level: 'resolved',
    title: incident.title,
    text,
    createdAt: new Date().toISOString(),
    channels: { inApp: true, email: false }
  };
  const email = await trySendEmail(`Liberte resolved — ${incident.title}`, text);
  alert.channels.email = Boolean(email.sent);
  s.list.push(alert);
  if (s.list.length > MAX_ALERTS) s.list.splice(0, s.list.length - MAX_ALERTS);
  return { alert };
}

// Test uyarısı — admin panelindeki "Test alert" butonu için
export async function sendTestAlert() {
  const text = redactText('🔔 Liberte Guardian test bildirimi — sistem uyarı kanalı çalışıyor.');
  const alert = {
    id: `ALERT-${Date.now()}`,
    incidentId: 'TEST',
    level: 'info',
    title: 'Test bildirimi',
    text,
    createdAt: new Date().toISOString(),
    channels: { inApp: true, email: false }
  };
  const email = await trySendEmail('Liberte Guardian test', text);
  alert.channels.email = Boolean(email.sent);
  const s = store();
  s.list.push(alert);
  if (s.list.length > MAX_ALERTS) s.list.splice(0, s.list.length - MAX_ALERTS);
  return { alert };
}

// Admin paneli için son uyarılar
export function listAlerts(limit = 20) {
  const s = store();
  return s.list.slice(-limit).reverse();
}

// Test/temizlik
export function resetAlerts() {
  globalThis.__liberteGuardianAlerts = undefined;
}
