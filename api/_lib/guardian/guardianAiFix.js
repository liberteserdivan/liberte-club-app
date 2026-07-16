import { STATUS } from './guardianConstants.js';
import { proposeAction } from './guardianApprovals.js';
import { listProposals, patchProposal, PROPOSAL_STATUS } from './guardianActionProposals.js';

// Liberte Guardian — Faz 3: AI fix bekliyor önerisi
// Tek sorumluluk: incident kaydında Cursor fix prompt hazır olduğunda
// Level 3 (human_required) onay merkezi kartı oluşturmak. Otomatik deploy/kod çalıştırmaz.

const PROMPT_PREVIEW_CHARS = 280;

function buildAiFixTitle(incident) {
  const title = String(incident?.title || 'Bilinmeyen sorun').slice(0, 80);
  return `AI fix bekliyor — ${title}`;
}

function buildAiFixDescription(incident) {
  const area = incident?.affectedArea || 'api';
  const level = incident?.level || STATUS.INCIDENT;
  return `${area} alanında ${level} seviyesinde sorun için Cursor düzeltme promptu hazır. `
    + 'Otomatik uygulanmaz; Cursor veya geliştirici müdahalesi bekleniyor.';
}

export async function proposeAiFixForIncident(incident) {
  if (!incident?.id) return null;
  if (!incident.autoReport?.ready) return null;

  const preview = String(incident.autoReport.cursorFixPromptMd || '').slice(0, PROMPT_PREVIEW_CHARS);

  const proposal = await proposeAction({
    incidentId: incident.id,
    title: buildAiFixTitle(incident),
    description: buildAiFixDescription(incident),
    affectedArea: incident.affectedArea || 'api',
    proposedAction: 'generate_cursor_fix_prompt',
    parameters: {
      incidentId: incident.id,
      reportReady: true,
      reportGeneratedAt: incident.autoReport.generatedAt || null,
      promptPreview: preview
    },
    expectedEffect: [
      'Kök neden için minimal kod düzeltmesi',
      'npm test ve npm run build doğrulaması'
    ],
    risks: [
      'Otomatik deploy veya migration yapılmamalı',
      'Müşteri verisi / LP puanları değiştirilmemeli'
    ],
    rollback: {
      type: 'none',
      description: 'Kod düzeltmesi manuel yapılır; Guardian otomatik geri alamaz.'
    }
  }, { autoExecute: false });

  if (!proposal || proposal.blocked) return null;
  return proposal;
}

export function filterAiFixWaitingProposals(proposals = []) {
  return proposals.filter((p) => p?.proposedAction === 'generate_cursor_fix_prompt'
    && p?.status === PROPOSAL_STATUS.HUMAN_REQUIRED);
}

// Incident çözülünce ilgili AI fix kartlarını kapat
export function dismissAiFixForResolvedIncident(incidentId) {
  if (!incidentId) return 0;
  const waiting = listProposals({ status: PROPOSAL_STATUS.HUMAN_REQUIRED, limit: 50 })
    .filter((p) => p.proposedAction === 'generate_cursor_fix_prompt' && p.incidentId === incidentId);
  const now = new Date().toISOString();
  for (const p of waiting) {
    patchProposal(p.id, {
      status: PROPOSAL_STATUS.REJECTED,
      rejectedAt: now,
      rejectNote: 'incident_resolved'
    });
  }
  return waiting.length;
}