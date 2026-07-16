import { STATUS, SERVICE } from './guardianConstants.js';
import {
  getActionPolicy, isBlockedAction, isAllowedAction
} from './guardianActionRegistry.js';
import {
  createProposal, getRawProposal, getProposal, patchProposal,
  recordExecution, listProposalGroups, PROPOSAL_STATUS
} from './guardianActionProposals.js';
import { executeProposal, rollbackProposal } from './guardianActionExecutor.js';
import { recordIncident } from './guardianIncidents.js';
import { raiseAlert } from './guardianAlerts.js';

// Liberte Guardian — Approval Autopilot orkestrasyonu (bölüm 7)
// Tek sorumluluk: öneri yaşam döngüsünü yönetmek — üret, onayla, reddet, uygula, geri al.
// Güvenlik kapıları executor + registry'dedir; burada akış ve denetim izi tutulur.

// Engellenen aksiyon denemesi → güvenlik incident'i + admin uyarısı
async function recordBlockedAttempt(action) {
  const inc = recordIncident({
    level: STATUS.CRITICAL,
    title: 'Engellenen aksiyon denendi',
    affectedArea: SERVICE.API,
    symptoms: [`blocked_action: ${String(action).slice(0, 40)}`],
    safeActionsTaken: ['blocked_action_rejected'],
    suspectedRootCauses: ['Yanlış kural konfigürasyonu veya kötüye kullanım girişimi'],
    recommendedAction: 'Bu aksiyon kalıcı/riskli olduğu için otomatik uygulanamaz. İnsan incelemesi gerekir.'
  });
  await raiseAlert(inc).catch(() => {});
  recordExecution({ proposalId: null, action, outcome: 'blocked' });
  return inc;
}

// Bir aksiyon önerisi oluştur. Risk seviyesine göre durum belirlenir:
//  - Level 3 (executable:false) → human_required (asla uygulanmaz)
//  - Level 2 (requiresApproval) → pending_approval (onay bekler)
//  - Level 0/1 → otomatik uygulanır (auto_executed)
export async function proposeAction(input = {}, { autoExecute = true } = {}) {
  const action = String(input.proposedAction || '').trim();

  // Blocklist → asla uygulanmaz, güvenlik incident'i düş
  if (isBlockedAction(action)) {
    const incident = await recordBlockedAttempt(action);
    return { ok: false, blocked: true, code: 'blocked_action', incidentId: incident.id,
      message: 'Bu işlem otomatik uygulanamaz. İnsan müdahalesi gerekiyor.' };
  }
  if (!isAllowedAction(action)) {
    return { ok: false, code: 'not_allowed', message: 'Tanımlı olmayan aksiyon önerilemez.' };
  }

  const policy = getActionPolicy(action);
  let status = PROPOSAL_STATUS.PENDING;
  let requiresHuman = false;
  if (!policy.executable && policy.riskLevel >= 3) {
    status = PROPOSAL_STATUS.HUMAN_REQUIRED;
    requiresHuman = true;
  }

  const proposal = createProposal({
    incidentId: input.incidentId || null,
    title: input.title,
    description: input.description,
    riskLevel: policy.riskLevel,
    status,
    affectedArea: input.affectedArea || SERVICE.API,
    proposedAction: action,
    parameters: input.parameters || {},
    expectedEffect: input.expectedEffect || [],
    risks: input.risks || [],
    rollback: input.rollback || null,
    requiresApproval: policy.requiresApproval,
    requiresHuman,
    createdBy: input.createdBy || 'guardian'
  });

  // Dedup ile mevcut aktif öneri döndüyse tekrar uygulama
  const raw = getRawProposal(proposal.id);
  const isFresh = raw && raw.occurrences === 1;

  // Level 0/1: onaysız + çalıştırılabilir → otomatik uygula
  if (autoExecute && isFresh && policy.executable && !policy.requiresApproval) {
    const exec = executeProposal(raw);
    if (exec.ok) {
      recordExecution({ proposalId: raw.id, action, outcome: 'auto_executed' });
      return patchProposal(raw.id, {
        status: PROPOSAL_STATUS.AUTO_EXECUTED,
        executedAt: new Date().toISOString(),
        result: { ok: true }
      });
    }
    recordExecution({ proposalId: raw.id, action, outcome: `auto_failed:${exec.code}` });
    return patchProposal(raw.id, { status: PROPOSAL_STATUS.FAILED, result: { ok: false, code: exec.code } });
  }

  return getProposal(proposal.id);
}

// Admin onayı → onayla ve uygula (executor kapılarından geçerek)
export async function approveAction(id, { adminId = null, requestId = null } = {}) {
  const raw = getRawProposal(id);
  if (!raw) return { ok: false, code: 'not_found', message: 'Öneri bulunamadı.' };
  if (raw.status !== PROPOSAL_STATUS.PENDING) {
    return { ok: false, code: 'invalid_state', message: 'Yalnızca onay bekleyen öneriler onaylanabilir.', proposal: getProposal(id) };
  }

  // Önce onay bilgisini işle (executor APPROVED durumunu görmeli). adminId maskelenir.
  patchProposal(id, {
    status: PROPOSAL_STATUS.APPROVED,
    approvedBy: maskId(adminId),
    approvedAt: new Date().toISOString()
  });

  const exec = executeProposal(getRawProposal(id));
  if (!exec.ok) {
    recordExecution({ proposalId: id, action: raw.proposedAction, outcome: `execute_failed:${exec.code}`, requestId, adminId });
    return { ok: false, code: exec.code, message: exec.message, proposal: patchProposal(id, { status: PROPOSAL_STATUS.FAILED, result: { ok: false, code: exec.code } }) };
  }

  recordExecution({ proposalId: id, action: raw.proposedAction, outcome: 'executed', requestId, adminId });
  return { ok: true, proposal: patchProposal(id, {
    status: PROPOSAL_STATUS.EXECUTED,
    executedAt: new Date().toISOString(),
    result: { ok: true }
  }) };
}

// Admin id'yi rapora/öneriye yazmadan önce maskele (PII sızıntısı önlemi)
function maskId(value) {
  const v = String(value ?? '').trim();
  if (!v) return null;
  if (v.length <= 4) return '****';
  return `${v.slice(0, 2)}${'*'.repeat(Math.max(2, v.length - 4))}${v.slice(-2)}`;
}

// Admin reddi → uygulanmaz, denetim izine ve öneriye not düşülür
export function rejectAction(id, { adminId = null, note = '', requestId = null } = {}) {
  const raw = getRawProposal(id);
  if (!raw) return { ok: false, code: 'not_found', message: 'Öneri bulunamadı.' };
  if (![PROPOSAL_STATUS.PENDING, PROPOSAL_STATUS.HUMAN_REQUIRED].includes(raw.status)) {
    return { ok: false, code: 'invalid_state', message: 'Bu öneri reddedilemez.', proposal: getProposal(id) };
  }
  recordExecution({ proposalId: id, action: raw.proposedAction, outcome: 'rejected', requestId, adminId });
  return { ok: true, proposal: patchProposal(id, {
    status: PROPOSAL_STATUS.REJECTED,
    rejectedBy: maskId(adminId),
    rejectedAt: new Date().toISOString(),
    rejectNote: String(note || '').slice(0, 200)
  }) };
}

// Onaylanmış ama henüz uygulanmamış öneriyi açıkça uygula (ayrı execute ucu)
export function executeApprovedAction(id, { adminId = null, requestId = null } = {}) {
  const raw = getRawProposal(id);
  if (!raw) return { ok: false, code: 'not_found', message: 'Öneri bulunamadı.' };
  if (raw.status !== PROPOSAL_STATUS.APPROVED) {
    return { ok: false, code: 'approval_required', message: 'Yalnızca onaylanmış öneriler uygulanabilir.', proposal: getProposal(id) };
  }
  const exec = executeProposal(raw);
  if (!exec.ok) {
    recordExecution({ proposalId: id, action: raw.proposedAction, outcome: `execute_failed:${exec.code}`, requestId, adminId });
    return { ok: false, code: exec.code, message: exec.message, proposal: getProposal(id) };
  }
  recordExecution({ proposalId: id, action: raw.proposedAction, outcome: 'executed', requestId, adminId });
  return { ok: true, proposal: patchProposal(id, {
    status: PROPOSAL_STATUS.EXECUTED,
    executedAt: new Date().toISOString(),
    result: { ok: true }
  }) };
}

// Uygulanmış bir aksiyonun etkisini geri al
export function rollbackAction(id, { adminId = null, requestId = null } = {}) {
  const raw = getRawProposal(id);
  if (!raw) return { ok: false, code: 'not_found', message: 'Öneri bulunamadı.' };
  if (![PROPOSAL_STATUS.EXECUTED, PROPOSAL_STATUS.AUTO_EXECUTED].includes(raw.status)) {
    return { ok: false, code: 'invalid_state', message: 'Yalnızca uygulanmış aksiyonlar geri alınabilir.', proposal: getProposal(id) };
  }
  const result = rollbackProposal(raw);
  if (!result.ok) {
    return { ok: false, code: result.code, message: result.message, proposal: getProposal(id) };
  }
  recordExecution({ proposalId: id, action: raw.proposedAction, outcome: 'rolled_back', requestId, adminId });
  return { ok: true, proposal: patchProposal(id, {
    status: PROPOSAL_STATUS.ROLLED_BACK,
    rolledBackAt: new Date().toISOString()
  }) };
}

// Onay merkezi gruplu listesi
export function listApprovalCenter() {
  return listProposalGroups();
}
