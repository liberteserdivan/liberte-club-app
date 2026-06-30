import test from 'node:test';
import assert from 'node:assert/strict';
import { STATUS } from '../api/_lib/guardian/guardianConstants.js';
import {
  proposeAiFixForIncident, filterAiFixWaitingProposals, dismissAiFixForResolvedIncident
} from '../api/_lib/guardian/guardianAiFix.js';
import { recordIncident, resolveIncident, resetIncidents } from '../api/_lib/guardian/guardianIncidents.js';
import { listProposalGroups, resetProposals, PROPOSAL_STATUS } from '../api/_lib/guardian/guardianActionProposals.js';
import { resetSafeMode } from '../api/_lib/guardian/guardianSafeMode.js';
import { resetMetrics } from '../api/_lib/guardian/guardianMetrics.js';

function freshState() {
  resetIncidents();
  resetProposals();
  resetSafeMode();
  resetMetrics();
}

test('Incident kaydinda AI fix bekliyor karti olusur', async () => {
  freshState();
  const inc = recordIncident({
    level: STATUS.INCIDENT,
    title: 'DB latency yuksek',
    affectedArea: 'db',
    symptoms: ['p95 4200ms']
  });
  await proposeAiFixForIncident(inc);

  const groups = listProposalGroups();
  assert.equal(groups.aiFixWaiting.length, 1);
  assert.equal(groups.aiFixWaiting[0].proposedAction, 'generate_cursor_fix_prompt');
  assert.equal(groups.aiFixWaiting[0].status, PROPOSAL_STATUS.HUMAN_REQUIRED);
  assert.match(groups.aiFixWaiting[0].title, /AI fix bekliyor/i);
  assert.equal(groups.humanRequired.length, 0);
});

test('AI fix karti prompt onizlemesi tasir', async () => {
  freshState();
  const inc = recordIncident({
    level: STATUS.INCIDENT,
    title: 'Login yavas',
    affectedArea: 'login'
  });
  const proposal = await proposeAiFixForIncident(inc);
  assert.ok(proposal.parameters?.promptPreview?.length > 20);
  assert.match(proposal.parameters.promptPreview, /Liberte Cursor Fix Prompt/);
});

test('Ayni incident icin dedup — tek AI fix karti', async () => {
  freshState();
  const inc = recordIncident({
    level: STATUS.INCIDENT,
    title: 'LP yavas',
    affectedArea: 'loyalty'
  });
  await proposeAiFixForIncident(inc);
  await proposeAiFixForIncident(inc);
  const groups = listProposalGroups();
  assert.equal(groups.aiFixWaiting.length, 1);
});

test('Incident cozulunce AI fix karti kapanir', async () => {
  freshState();
  const inc = recordIncident({
    level: STATUS.INCIDENT,
    title: 'QR yavas',
    affectedArea: 'qr'
  });
  await proposeAiFixForIncident(inc);
  assert.equal(listProposalGroups().aiFixWaiting.length, 1);

  resolveIncident(inc.id);
  assert.equal(listProposalGroups().aiFixWaiting.length, 0);
});

test('filterAiFixWaitingProposals yalnizca generate_cursor_fix_prompt secer', () => {
  const list = filterAiFixWaitingProposals([
    { proposedAction: 'generate_cursor_fix_prompt', status: PROPOSAL_STATUS.HUMAN_REQUIRED },
    { proposedAction: 'enable_safe_mode', status: PROPOSAL_STATUS.HUMAN_REQUIRED },
    { proposedAction: 'generate_cursor_fix_prompt', status: PROPOSAL_STATUS.PENDING }
  ]);
  assert.equal(list.length, 1);
});

test('autoReport yoksa AI fix karti olusmaz', async () => {
  freshState();
  const proposal = await proposeAiFixForIncident({ id: 'x', title: 't', autoReport: null });
  assert.equal(proposal, null);
});