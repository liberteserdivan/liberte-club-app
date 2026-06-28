import { STATUS } from './guardianConstants.js';
import {
  getActionPolicy, isBlockedAction, isAllowedAction
} from './guardianActionRegistry.js';
import { enableSafeMode, disableSafeMode } from './guardianSafeMode.js';
import { PROPOSAL_STATUS } from './guardianActionProposals.js';

// Liberte Guardian — Approval Autopilot çalıştırıcısı (executor)
// Tek sorumluluk: bir öneriyi GÜVENLİK KAPILARINDAN geçirip izinli yan etkiyi uygulamak.
// Asla: veri silme, LP düzeltme, migration, deploy, yetki/secret değişimi.
// Tüm kapılar geçilmeden hiçbir aksiyon çalışmaz.

// Çalıştırma engellerini döndüren kapı kontrolü. Engel yoksa null döner.
export function checkExecutionGate(proposal) {
  const action = proposal?.proposedAction;

  // 1) Blocklist en yüksek öncelik — asla çalışmaz
  if (isBlockedAction(action)) {
    return { code: 'blocked_action', message: 'Bu aksiyon kalıcı/riskli olduğu için Guardian tarafından çalıştırılamaz.' };
  }
  // 2) Allowlist dışı → çalışmaz
  if (!isAllowedAction(action)) {
    return { code: 'not_allowed', message: 'Tanımlı izin listesinde olmayan aksiyon çalıştırılamaz.' };
  }
  const policy = getActionPolicy(action);
  // 3) executable:false (Level 3 / yalnızca öneri) → çalışmaz
  if (!policy.executable) {
    return { code: 'not_executable', message: 'Bu işlem otomatik uygulanamaz. İnsan müdahalesi gerekiyor.' };
  }
  // 4) Onay gerekiyorsa öneri APPROVED olmalı
  if (policy.requiresApproval && proposal.status !== PROPOSAL_STATUS.APPROVED) {
    return { code: 'approval_required', message: 'Bu aksiyon için admin onayı gereklidir.' };
  }
  // 5) TTL zorunluysa geçerli bir ttlMinutes olmalı
  if (policy.ttlRequired) {
    const ttl = Number(proposal?.parameters?.ttlMinutes);
    if (!Number.isFinite(ttl) || ttl <= 0) {
      return { code: 'ttl_required', message: 'Bu aksiyon TTL (süre) olmadan çalıştırılamaz.' };
    }
  }
  return null;
}

// İzinli yan etkileri uygula. Yalnızca Safe Mode mekanizması üzerinden çalışır.
function performAction(action, params = {}) {
  const ttlMinutes = Number(params.ttlMinutes) || 60;
  switch (action) {
    case 'enable_safe_mode':
      return {
        safeMode: enableSafeMode({
          reason: params.reason || 'approved_enable_safe_mode',
          level: params.level || STATUS.DEGRADED,
          ttlMinutes,
          features: params.features || {}
        })
      };
    case 'disable_safe_mode':
      return { safeMode: disableSafeMode() };
    case 'reduce_polling':
      return {
        safeMode: enableSafeMode({
          reason: params.reason || 'reduce_polling',
          level: STATUS.DEGRADED,
          ttlMinutes,
          features: { polling: 'reduced' }
        })
      };
    case 'degrade_realtime':
      return {
        safeMode: enableSafeMode({
          reason: params.reason || 'degrade_realtime',
          level: STATUS.DEGRADED,
          ttlMinutes,
          features: { realtime: 'degraded' }
        })
      };
    case 'show_maintenance_message':
      return {
        safeMode: enableSafeMode({
          reason: params.reason || 'maintenance_message',
          level: STATUS.DEGRADED,
          ttlMinutes,
          features: { ...(params.features || {}), maintenanceMessage: 'on' }
        })
      };
    default:
      // Buraya gelinmez (kapılar engeller) ama güvenli taraf
      throw new Error('unsupported_action');
  }
}

// Öneriyi çalıştır. Kapı engeli varsa uygulamaz.
// Döndürür: { ok, code?, message?, result? }
export function executeProposal(proposal) {
  const gate = checkExecutionGate(proposal);
  if (gate) return { ok: false, ...gate };

  try {
    const result = performAction(proposal.proposedAction, proposal.parameters || {});
    return { ok: true, result };
  } catch {
    return { ok: false, code: 'execution_failed', message: 'Aksiyon uygulanırken hata oluştu.' };
  }
}

// Bir önerinin etkisini geri al (rollback). Safe Mode tabanlı aksiyonlar için Safe Mode kapatılır.
// Döndürür: { ok, code?, message?, result? }
export function rollbackProposal(proposal) {
  const action = proposal?.proposedAction;
  switch (action) {
    case 'enable_safe_mode':
    case 'reduce_polling':
    case 'degrade_realtime':
    case 'show_maintenance_message':
      return { ok: true, result: { safeMode: disableSafeMode() } };
    case 'disable_safe_mode':
      // Önceki konfigürasyon saklanmadığı için otomatik geri alınamaz
      return { ok: false, code: 'rollback_unsupported', message: 'Safe Mode kapatma işlemi otomatik geri alınamaz; gerekiyorsa elle açın.' };
    default:
      return { ok: false, code: 'rollback_unsupported', message: 'Bu aksiyon için geri alma tanımlı değil.' };
  }
}
