import { STATUS, SERVICE, THRESHOLDS } from './guardianConstants.js';
import { summarizeService, recentDurations } from './guardianMetrics.js';
import { readSafeModeSync, enableSafeMode } from './guardianSafeMode.js';
import { recordIncident } from './guardianIncidents.js';
import { raiseAlert } from './guardianAlerts.js';
import { proposeAction } from './guardianApprovals.js';
import { createProposal, PROPOSAL_STATUS } from './guardianActionProposals.js';
import { shouldAutoAlertForIncident } from './guardianAutoReport.js';

// Liberte Guardian — otomatik güvenli müdahale kuralları (bölüm 7 + Approval Autopilot)
// Tek sorumluluk: metrikleri değerlendirip GÜVENLİ aksiyonları tetiklemek.
// Asla: veri silme, LP düzeltme, migration, deploy, yetki/secret değişimi.
//
// Approval Autopilot davranışı:
//  - Level 1 (polling azalt / realtime degraded): HAFİF koruma, ANINDA + otomatik uygulanır
//    (gece koruması — admin yokken bile devreye girer, TTL'li, geri alınabilir).
//  - Level 2 (tam Safe Mode: fullStatePull/dailyClaim dahil): otomatik açılmaz,
//    admin + PIN onayı için ÖNERİ olarak bırakılır.

// Son N ölçümün tamamı eşik üstünde mi? (üst üste yavaşlık)
function consecutiveSlow(service, thresholdMs, count) {
  const list = recentDurations(service, { count });
  if (list.length < count) return false;
  return list.every((x) => Number.isFinite(x.durationMs) && x.durationMs >= thresholdMs);
}

// Onay merkezinde görünürlük için otomatik (Level 1) aksiyon kaydı oluştur (dedup'lı, display).
function recordAutoL1(action, incident, reason) {
  return createProposal({
    incidentId: incident.id,
    title: action === 'reduce_polling' ? 'Polling otomatik azaltıldı (Level 1)' : 'Realtime otomatik degraded (Level 1)',
    description: `${reason} nedeniyle ${action} otomatik (Level 1, hafif) uygulandı.`,
    riskLevel: 1,
    status: PROPOSAL_STATUS.AUTO_EXECUTED,
    affectedArea: incident.affectedArea,
    proposedAction: action,
    parameters: { ttlMinutes: 60 },
    requiresApproval: false,
    requiresHuman: false,
    rollback: { type: 'safe_mode_disable', description: 'Normal davranışa dönmek için Safe Mode kapatılır.' }
  });
}

// Tek bir kuralı uygula:
//  1) incident kaydet + (gerekiyorsa) alert (Level 0, otomatik)
//  2) Level 1 hafif korumayı ANINDA uygula (polling/realtime) — TTL her tetiklemede tazelenir
//  3) Level 2 tam Safe Mode için onay ÖNERİSİ bırak (onaysız uygulanmaz)
async function applyIntervention({
  reason, level, features, incident,
  expectedEffect = [
    'Gereksiz arka plan trafiği azalır',
    'Realtime yükü düşer',
    'Kullanıcı ana akışı açık kalır'
  ],
  risks = ['Bazı arka plan güncellemeleri daha geç gelebilir']
}) {
  const created = recordIncident(incident);
  if (shouldAutoAlertForIncident(created)) {
    await raiseAlert(created).catch(() => {});
  }

  // 2) Level 1 hafif koruma (yalnızca polling/realtime). fullStatePull/dailyClaim normal kalır.
  const lightFeatures = {};
  if (features.polling === 'reduced') lightFeatures.polling = 'reduced';
  if (features.realtime === 'degraded') lightFeatures.realtime = 'degraded';
  const autoActions = [];
  if (Object.keys(lightFeatures).length > 0) {
    enableSafeMode({ reason: `auto_l1:${reason}`, level: STATUS.DEGRADED, ttlMinutes: 60, features: lightFeatures, light: true });
    if (lightFeatures.polling) { recordAutoL1('reduce_polling', created, reason); autoActions.push('reduce_polling'); }
    if (lightFeatures.realtime) { recordAutoL1('degrade_realtime', created, reason); autoActions.push('degrade_realtime'); }
  }

  // 3) Level 2 tam Safe Mode → onay önerisi (dedup'lı)
  const proposal = await proposeAction({
    incidentId: created.id,
    title: `${incident.affectedArea} için tam Safe Mode önerisi`,
    description: `${reason} nedeniyle tam Safe Mode (fullStatePull/dailyClaim dahil) öneriliyor. Hafif koruma zaten otomatik uygulandı.`,
    affectedArea: incident.affectedArea,
    proposedAction: 'enable_safe_mode',
    parameters: { level, ttlMinutes: 60, features },
    expectedEffect,
    risks,
    rollback: {
      type: 'safe_mode_disable',
      description: 'Safe Mode kapatılırsa normal polling/realtime davranışı geri döner.'
    }
  }).catch(() => null);

  return { incidentId: created.id, autoActions, proposalId: proposal?.id || null, safeActionsTaken: created.safeActionsTaken };
}

// 7.1 — DB latency yüksek
async function ruleDbLatency() {
  const summary = summarizeService(SERVICE.DB);
  const slowStreak = consecutiveSlow(SERVICE.DB, THRESHOLDS.DB_PING_CRITICAL_MS, THRESHOLDS.CONSECUTIVE_SLOW_FOR_ACTION);
  const tooManyTimeouts = summary.timeoutCount >= THRESHOLDS.WINDOW_TIMEOUT_COUNT;
  if (!slowStreak && !tooManyTimeouts) return null;

  return applyIntervention({
    reason: 'DB latency high',
    level: STATUS.INCIDENT,
    features: { polling: 'reduced', realtime: 'degraded', adminDashboardRefresh: 'reduced' },
    incident: {
      level: STATUS.INCIDENT,
      title: 'DB latency yüksek',
      affectedArea: SERVICE.DB,
      symptoms: [`DB p95 ${summary.p95Ms}ms`, `timeout x${summary.timeoutCount}`],
      safeActionsTaken: ['polling_reduced', 'realtime_degraded', 'admin_refresh_reduced'],
      suspectedRootCauses: ['Supabase pooler latency', 'Stale connection', 'Cold start'],
      relatedFiles: ['api/_lib/runSql.js', 'api/_lib/dbConnection.js', 'api/_lib/sql.js'],
      recommendedAction: 'Cursor fix prompt üretildi. DB bağlantı/timeout stratejisi gözden geçirilmeli.'
    }
  });
}

// 7.2 — Login yavaş
async function ruleLoginSlow() {
  const summary = summarizeService(SERVICE.LOGIN);
  const slowStreak = consecutiveSlow(SERVICE.LOGIN, THRESHOLDS.LOGIN_SLOW_MS, THRESHOLDS.CONSECUTIVE_SLOW_FOR_ACTION);
  const highErrorRate = summary.sampleCount >= 5 && summary.errorRate >= THRESHOLDS.API_ERROR_RATE_DEGRADED;
  if (!slowStreak && !highErrorRate) return null;

  return applyIntervention({
    reason: 'Login slow',
    level: STATUS.INCIDENT,
    features: { fullStatePull: 'disabled_for_customer' },
    incident: {
      level: STATUS.INCIDENT,
      title: 'Login yavaş veya hatalı',
      affectedArea: SERVICE.LOGIN,
      symptoms: [`login p95 ${summary.p95Ms}ms`, `errorRate ${Math.round(summary.errorRate * 100)}%`],
      safeActionsTaken: ['customer_full_state_pull_deferred', 'minimal_bootstrap'],
      suspectedRootCauses: ['Cold start', 'Session table latency', 'Full state pull storm'],
      relatedFiles: ['api/_lib/handlers/authLogin.js', 'src/hooks/useCommit.js'],
      recommendedAction: 'Cursor fix prompt üretildi. Login sonrası bootstrap minimal tutulmalı.'
    }
  });
}

// 7.3 — LP sistemi yavaş
async function ruleLoyaltySlow() {
  const summary = summarizeService(SERVICE.LOYALTY);
  const slowStreak = consecutiveSlow(SERVICE.LOYALTY, THRESHOLDS.LP_SLOW_MS, 5);
  const tooManyTimeouts = summary.timeoutCount >= THRESHOLDS.WINDOW_TIMEOUT_COUNT;
  if (!slowStreak && !tooManyTimeouts) return null;

  return applyIntervention({
    reason: 'LP action slow',
    level: STATUS.INCIDENT,
    features: { loyalty: 'enabled_with_short_timeout', polling: 'reduced' },
    incident: {
      level: STATUS.INCIDENT,
      title: 'LP sistemi yavaş',
      affectedArea: SERVICE.LOYALTY,
      symptoms: [`LP p95 ${summary.p95Ms}ms`, `timeout x${summary.timeoutCount}`],
      safeActionsTaken: ['lp_full_state_refresh_disabled', 'polling_reduced', 'duplicate_lp_blocked'],
      suspectedRootCauses: ['DB transaction lock', 'Supabase pooler latency', 'Full state refresh storm'],
      relatedFiles: ['api/_lib/loyaltyStore.js', 'src/components/CustomerQrScanner.jsx'],
      recommendedAction: 'Cursor fix prompt üretildi. LP transaction/locking gözden geçirilmeli.'
    }
  });
}

// 7.4 — QR açılmıyor/yavaş
async function ruleQrSlow() {
  const summary = summarizeService(SERVICE.QR);
  const tooManyTimeouts = summary.timeoutCount >= THRESHOLDS.WINDOW_TIMEOUT_COUNT;
  const highP95 = summary.p95Ms != null && summary.p95Ms >= THRESHOLDS.QR_SLOW_MS;
  if (!tooManyTimeouts && !highP95) return null;

  return applyIntervention({
    reason: 'QR generate slow',
    level: STATUS.INCIDENT,
    features: { polling: 'reduced' },
    incident: {
      level: STATUS.INCIDENT,
      title: 'QR oluşturma yavaş/başarısız',
      affectedArea: SERVICE.QR,
      symptoms: [`QR p95 ${summary.p95Ms}ms`, `timeout x${summary.timeoutCount}`],
      safeActionsTaken: ['qr_health_check', 'web_cookie_direct_generate', 'native_token_hydration_reported'],
      suspectedRootCauses: ['Cold start', 'QR signing latency', 'Native token hydration failure'],
      relatedFiles: ['api/qr.js', 'api/_lib/qrToken.js', 'src/pages/QrPage.jsx'],
      recommendedAction: 'Cursor fix prompt üretildi. QR maxDuration ve token hydration kontrol edilmeli.'
    }
  });
}

// 7.5 — Realtime sorunlu
async function ruleRealtime() {
  const summary = summarizeService(SERVICE.REALTIME);
  const highErrorRate = summary.sampleCount >= 5 && summary.errorRate >= 0.4;
  if (!highErrorRate) return null;

  return applyIntervention({
    reason: 'Realtime unstable',
    level: STATUS.DEGRADED,
    features: { realtime: 'degraded', polling: 'reduced' },
    incident: {
      level: STATUS.DEGRADED,
      title: 'Realtime kararsız',
      affectedArea: SERVICE.REALTIME,
      symptoms: [`realtime errorRate ${Math.round(summary.errorRate * 100)}%`],
      safeActionsTaken: ['realtime_degraded', 'polling_controlled_fallback'],
      suspectedRootCauses: ['Supabase realtime token error', 'Reconnect storm'],
      relatedFiles: ['src/lib/realtimeManager.js', 'src/hooks/useCustomerRealtime.js'],
      recommendedAction: 'Cursor fix prompt üretildi. Realtime fallback polling kontrol edilmeli.'
    }
  });
}

// Tüm kuralları değerlendir ve tetiklenenleri uygula.
// Döndürür: { actionsTaken: [...], safeMode }
export async function evaluateAndIntervene() {
  const results = [];
  for (const rule of [ruleDbLatency, ruleLoginSlow, ruleLoyaltySlow, ruleQrSlow, ruleRealtime]) {
    try {
      const outcome = await rule();
      if (outcome) results.push(outcome);
    } catch {
      // Tek bir kuralın hatası diğerlerini durdurmasın
    }
  }
  return { actionsTaken: results, safeMode: readSafeModeSync() };
}
