import { redactText, redactObject, maskCustomerId } from './mask.js';
import { filterAiFixWaitingProposals } from './guardianAiFix.js';

// Liberte Guardian — Approval Autopilot öneri (proposal) ve uygulama (execution) deposu
// Tek sorumluluk: aksiyon önerilerini ve uygulama kayıtlarını bellekte tutmak.
// Yan etki YALNIZCA bellek; gerçek aksiyonlar executor'da çalışır.
// NOT: Bellek tabanlı (lambda ömrü). Kalıcı kayıt: scripts/sql/007_guardian_approvals.sql (öneri).

const MAX_PROPOSALS = 100;
const MAX_EXECUTIONS = 200;

// Öneri yaşam döngüsü durumları
export const PROPOSAL_STATUS = Object.freeze({
  PENDING: 'pending_approval',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXECUTED: 'executed',
  AUTO_EXECUTED: 'auto_executed',
  ROLLED_BACK: 'rolled_back',
  HUMAN_REQUIRED: 'human_required',
  FAILED: 'failed'
});

// "Aktif" sayılan durumlar — dedup bunlara bakar (spam öneri engeli)
const ACTIVE_STATUSES = new Set([
  PROPOSAL_STATUS.PENDING,
  PROPOSAL_STATUS.APPROVED,
  PROPOSAL_STATUS.AUTO_EXECUTED,
  PROPOSAL_STATUS.EXECUTED,
  PROPOSAL_STATUS.HUMAN_REQUIRED
]);

function store() {
  if (!globalThis.__liberteGuardianActionProposals) {
    globalThis.__liberteGuardianActionProposals = { list: [], seq: 0, executions: [] };
  }
  return globalThis.__liberteGuardianActionProposals;
}

// Tarih → YYYYMMDD (proposal id için)
function dayStamp(date = new Date()) {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`;
}

// Dedup anahtarı — aynı incident/alan + aynı aksiyon tek öneridir
function dedupKey({ incidentId, affectedArea, proposedAction }) {
  return `${incidentId || affectedArea || 'na'}::${proposedAction}`;
}

function findActive(s, key) {
  return s.list.find((p) => p._key === key && ACTIVE_STATUSES.has(p.status)) || null;
}

// Güvenli string dizisi (her eleman redact'ten geçer, sınırlı uzunluk)
function safeStrList(arr) {
  return (Array.isArray(arr) ? arr : []).slice(0, 20).map((x) => redactText(String(x)));
}

// Yeni öneri oluştur veya mevcut aktif olanı güncelle (dedup).
// status başlangıç değeri çağıran (approvals) tarafından belirlenir.
export function createProposal({
  incidentId = null,
  title,
  description = '',
  riskLevel = 2,
  status = PROPOSAL_STATUS.PENDING,
  affectedArea = 'api',
  proposedAction,
  parameters = {},
  expectedEffect = [],
  risks = [],
  rollback = null,
  requiresApproval = true,
  requiresHuman = false,
  createdBy = 'guardian'
} = {}) {
  const s = store();
  const key = dedupKey({ incidentId, affectedArea, proposedAction });
  const nowIso = new Date().toISOString();

  const existing = findActive(s, key);
  if (existing) {
    // Spam engeli: yeni kayıt açma, mevcut aktif öneriyi tazele
    existing.lastSeenAt = nowIso;
    existing.occurrences = (existing.occurrences || 1) + 1;
    return publicView(existing);
  }

  s.seq += 1;
  const proposal = {
    id: `LBT-ACT-${dayStamp()}-${String(s.seq).padStart(3, '0')}`,
    _key: key,
    incidentId: incidentId || null,
    title: redactText(title || 'Guardian aksiyon önerisi'),
    description: redactText(description),
    riskLevel,
    status,
    affectedArea,
    proposedAction,
    // Parametreler de redact'ten geçer (secret/PII kaçağı önlenir)
    parameters: redactObject(parameters || {}),
    expectedEffect: safeStrList(expectedEffect),
    risks: safeStrList(risks),
    rollback: rollback ? redactObject(rollback) : null,
    requiresApproval: Boolean(requiresApproval),
    requiresHuman: Boolean(requiresHuman),
    occurrences: 1,
    createdAt: nowIso,
    lastSeenAt: nowIso,
    createdBy,
    approvedBy: null,
    approvedAt: null,
    rejectedBy: null,
    rejectedAt: null,
    rejectNote: null,
    executedAt: null,
    rolledBackAt: null,
    result: null
  };

  s.list.push(proposal);
  if (s.list.length > MAX_PROPOSALS) s.list.splice(0, s.list.length - MAX_PROPOSALS);
  return publicView(proposal);
}

// Dahili: ham (redact edilmemiş _key dahil) öneriyi getir — sadece bu modül + executor içi
export function getRawProposal(id) {
  return store().list.find((p) => p.id === id) || null;
}

// Öneriyi alanlarıyla güncelle (yalnızca izinli alanlar). Döndürür: publicView
export function patchProposal(id, patch = {}) {
  const p = getRawProposal(id);
  if (!p) return null;
  const allowed = [
    'status', 'approvedBy', 'approvedAt', 'rejectedBy', 'rejectedAt',
    'rejectNote', 'executedAt', 'rolledBackAt', 'result'
  ];
  for (const k of allowed) {
    if (k in patch) p[k] = patch[k];
  }
  return publicView(p);
}

// Uygulama (execution) kaydı ekle — denetim izi
export function recordExecution({ proposalId, action, outcome, requestId = null, adminId = null }) {
  const s = store();
  s.executions.push({
    proposalId,
    action,
    outcome,
    requestId,
    adminId: adminId ? maskCustomerId(adminId) : null,
    at: new Date().toISOString()
  });
  if (s.executions.length > MAX_EXECUTIONS) s.executions.splice(0, s.executions.length - MAX_EXECUTIONS);
}

export function listExecutions(limit = 50) {
  return store().executions.slice(-limit).reverse();
}

// Önerileri durum filtresiyle listele (en yeni önce). _key sızdırılmaz.
export function listProposals({ status = null, limit = 50 } = {}) {
  const s = store();
  let list = s.list.slice().reverse();
  if (status) list = list.filter((p) => p.status === status);
  return list.slice(0, limit).map(publicView);
}

// Onay merkezi için gruplu görünüm
export function listProposalGroups() {
  const humanRequired = listProposals({ status: PROPOSAL_STATUS.HUMAN_REQUIRED, limit: 50 });
  const aiFixWaiting = filterAiFixWaitingProposals(humanRequired);
  const otherHumanRequired = humanRequired.filter(
    (p) => p.proposedAction !== 'generate_cursor_fix_prompt'
  );

  return {
    pending: listProposals({ status: PROPOSAL_STATUS.PENDING, limit: 50 }),
    approved: listProposals({ status: PROPOSAL_STATUS.APPROVED, limit: 20 }),
    executed: [
      ...listProposals({ status: PROPOSAL_STATUS.EXECUTED, limit: 20 }),
      ...listProposals({ status: PROPOSAL_STATUS.AUTO_EXECUTED, limit: 20 })
    ],
    rejected: listProposals({ status: PROPOSAL_STATUS.REJECTED, limit: 20 }),
    rolledBack: listProposals({ status: PROPOSAL_STATUS.ROLLED_BACK, limit: 20 }),
    humanRequired: otherHumanRequired,
    aiFixWaiting
  };
}

export function getProposal(id) {
  const p = getRawProposal(id);
  return p ? publicView(p) : null;
}

// Dışa açık görünüm — dahili _key alanını çıkar
function publicView(p) {
  const { _key, ...rest } = p;
  return { ...rest };
}

// Test/temizlik
export function resetProposals() {
  globalThis.__liberteGuardianActionProposals = undefined;
}
