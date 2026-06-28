import { STATUS, SERVICE, THRESHOLDS } from './guardianConstants.js';
import { summarizeService, recentDurations } from './guardianMetrics.js';
import { readSafeModeSync } from './guardianSafeMode.js';
import { recordIncident } from './guardianIncidents.js';
import { raiseAlert } from './guardianAlerts.js';
import { proposeAction } from './guardianApprovals.js';

// Liberte Guardian — otomatik güvenli müdahale kuralları (bölüm 7 + Approval Autopilot)
// Tek sorumluluk: metrikleri değerlendirip GÜVENLİ aksiyonları tetiklemek.
// Asla: veri silme, LP düzeltme, migration, deploy, yetki/secret değişimi.
//
// ÖNEMLİ (Approval Autopilot): Safe Mode (Level 2) ARTIK OTOMATİK AÇILMAZ.
// Bot yalnızca otomatik olarak: incident kaydeder + alert üretir +
// admin onayı için "Safe Mode aç" ÖNERİSİ oluşturur. Etkili müdahale
// ancak admin + PIN onayından sonra uygulanır.

// Son N ölçümün tamamı eşik üstünde mi? (üst üste yavaşlık)
function consecutiveSlow(service, thresholdMs, count) {
  const list = recentDurations(service, { count });
  if (list.length < count) return false;
  return list.every((x) => Number.isFinite(x.durationMs) && x.durationMs >= thresholdMs);
}

// Tek bir kuralı uygula: incident kaydet + alert üret + Safe Mode ÖNERİSİ oluştur (onaysız uygulanmaz)
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
  // requiresHuman ise admin'e bildir (spam guard içerir)
  if (created.requiresHuman) {
    await raiseAlert(created).catch(() => {});
  }
  // Level 2 → doğrudan açma yok; admin onayı için öneri üret (dedup'lı)
  const proposal = await proposeAction({
    incidentId: created.id,
    title: `${incident.affectedArea} için Safe Mode önerisi`,
    description: `${reason} nedeniyle Safe Mode (azaltılmış mod) öneriliyor.`,
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
  return { incidentId: created.id, proposalId: proposal?.id || null, safeActionsTaken: created.safeActionsTaken };
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
