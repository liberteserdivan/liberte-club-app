import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isBlockedAction, isAllowedAction, isAutoExecutable, getActionPolicy,
  GUARDIAN_BLOCKED_ACTIONS
} from '../api/_lib/guardian/guardianActionRegistry.js';
import {
  checkExecutionGate, rollbackProposal
} from '../api/_lib/guardian/guardianActionExecutor.js';
import {
  proposeAction, approveAction, rejectAction, executeApprovedAction, rollbackAction
} from '../api/_lib/guardian/guardianApprovals.js';
import {
  createProposal, getProposal, resetProposals, PROPOSAL_STATUS
} from '../api/_lib/guardian/guardianActionProposals.js';
import { resetSafeMode, readSafeModeSync } from '../api/_lib/guardian/guardianSafeMode.js';
import { resetIncidents, listIncidents } from '../api/_lib/guardian/guardianIncidents.js';
import { handleGuardian } from '../api/_lib/handlers/guardian.js';

function freshState() {
  resetProposals();
  resetSafeMode();
  resetIncidents();
}

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    end() { return this; },
    json(obj) { this.body = obj; return this; }
  };
}

// ---- Registry / allowlist ----

test('Allowlist ve blocklist tutarlı', () => {
  assert.equal(isAllowedAction('enable_safe_mode'), true);
  assert.equal(isBlockedAction('run_migration'), true);
  // Blocklist allowlist'i ezer
  assert.equal(getActionPolicy('run_migration'), null);
  // Level 0/1 otomatik; Level 2 değil
  assert.equal(isAutoExecutable('reduce_polling'), true);
  assert.equal(isAutoExecutable('enable_safe_mode'), false);
  // Level 3 çalıştırılamaz
  assert.equal(getActionPolicy('generate_cursor_fix_prompt').executable, false);
});

// ---- Blocked actions: asla çalışmaz ----

for (const action of ['run_migration', 'deploy_production', 'modify_loyalty_balance', 'delete_customer']) {
  test(`Blocked action reddedilir: ${action}`, () => {
    const gate = checkExecutionGate({ proposedAction: action, status: 'approved', parameters: {} });
    assert.equal(gate.code, 'blocked_action');
  });
}

test('Blocked action propose edilince güvenlik incident düşer ve uygulanmaz', async () => {
  freshState();
  const res = await proposeAction({ proposedAction: 'run_migration', title: 'x' });
  assert.equal(res.ok, false);
  assert.equal(res.blocked, true);
  const incidents = listIncidents({ limit: 10 });
  assert.ok(incidents.some((i) => i.title.includes('Engellenen aksiyon')), 'güvenlik incident kaydı olmalı');
  // Safe Mode kesinlikle açılmadı
  assert.equal(readSafeModeSync().enabled, false);
});

// ---- Approval required (Level 2) ----

test('Level 2 aksiyon onaysız çalışmaz, onay sonrası uygulanır', async () => {
  freshState();
  const proposal = await proposeAction({
    proposedAction: 'enable_safe_mode',
    title: 'LP Safe Mode önerisi',
    affectedArea: 'loyalty',
    parameters: { level: 'degraded', ttlMinutes: 60, features: { polling: 'reduced' } }
  });
  // Onaysız: pending, Safe Mode kapalı
  assert.equal(proposal.status, PROPOSAL_STATUS.PENDING);
  assert.equal(readSafeModeSync().enabled, false);

  // Onaysız execute denemesi reddedilir
  const earlyGate = checkExecutionGate({ proposedAction: 'enable_safe_mode', status: PROPOSAL_STATUS.PENDING, parameters: { ttlMinutes: 60 } });
  assert.equal(earlyGate.code, 'approval_required');

  // Onayla → uygulanır
  const approved = await approveAction(proposal.id, { adminId: '123456' });
  assert.equal(approved.ok, true);
  assert.equal(approved.proposal.status, PROPOSAL_STATUS.EXECUTED);
  assert.equal(readSafeModeSync().enabled, true);
  // approvedBy maskeli olmalı (ham id sızmaz)
  assert.notEqual(approved.proposal.approvedBy, '123456');
  assert.ok(/\*/.test(approved.proposal.approvedBy));
});

test('Reddedilen öneri uygulanmaz', async () => {
  freshState();
  const proposal = await proposeAction({
    proposedAction: 'enable_safe_mode',
    title: 'Safe Mode önerisi',
    parameters: { ttlMinutes: 60 }
  });
  const rejected = rejectAction(proposal.id, { adminId: '123456', note: 'gerek yok' });
  assert.equal(rejected.ok, true);
  assert.equal(rejected.proposal.status, PROPOSAL_STATUS.REJECTED);
  // Reddedilen öneri sonradan execute edilemez
  const exec = executeApprovedAction(proposal.id, { adminId: '123456' });
  assert.equal(exec.ok, false);
  assert.equal(readSafeModeSync().enabled, false);
});

// ---- Level 3: asla execute edilmez ----

test('Level 3 öneri human_required olur ve çalıştırılamaz', async () => {
  freshState();
  const proposal = await proposeAction({
    proposedAction: 'generate_cursor_fix_prompt',
    title: 'Cursor prompt'
  });
  assert.equal(proposal.status, PROPOSAL_STATUS.HUMAN_REQUIRED);
  assert.equal(proposal.requiresHuman, true);
  const gate = checkExecutionGate({ proposedAction: 'generate_cursor_fix_prompt', status: 'approved', parameters: {} });
  assert.equal(gate.code, 'not_executable');
});

// ---- Level 0/1: otomatik uygulanır ----

test('Level 1 (reduce_polling) otomatik uygulanır', async () => {
  freshState();
  const proposal = await proposeAction({
    proposedAction: 'reduce_polling',
    title: 'Polling azalt',
    parameters: { ttlMinutes: 30 }
  });
  assert.equal(proposal.status, PROPOSAL_STATUS.AUTO_EXECUTED);
  assert.equal(readSafeModeSync().features.polling, 'reduced');
});

test('Level 1 hafif mod fullStatePull/dailyClaim normal bırakır', async () => {
  freshState();
  await proposeAction({ proposedAction: 'reduce_polling', title: 'p', parameters: { ttlMinutes: 30 } });
  const sm = readSafeModeSync();
  // Hafif koruma: customer full state pull ve daily claim normal kalır (sadece polling azalır)
  assert.equal(sm.features.polling, 'reduced');
  assert.equal(sm.features.fullStatePull, 'enabled');
  assert.equal(sm.features.dailyClaim, 'enabled');
});

test('Hafif mod art arda uygulamada önceki azaltmaları korur', async () => {
  freshState();
  await proposeAction({ proposedAction: 'reduce_polling', title: 'p', parameters: { ttlMinutes: 30 } });
  await proposeAction({ proposedAction: 'degrade_realtime', title: 'r', parameters: { ttlMinutes: 30 } });
  const sm = readSafeModeSync();
  assert.equal(sm.features.polling, 'reduced');
  assert.equal(sm.features.realtime, 'degraded');
});

// ---- TTL zorunluluğu ----

test('TTL gereken aksiyon TTL olmadan çalışmaz', async () => {
  freshState();
  const proposal = await proposeAction({
    proposedAction: 'enable_safe_mode',
    title: 'TTL yok',
    parameters: {} // ttlMinutes yok
  });
  const approved = await approveAction(proposal.id, { adminId: '123456' });
  assert.equal(approved.ok, false);
  assert.equal(approved.code, 'ttl_required');
  assert.equal(readSafeModeSync().enabled, false);
});

test('TTL dolunca Safe Mode etkisi sona erer', async () => {
  freshState();
  const proposal = await proposeAction({
    proposedAction: 'enable_safe_mode', title: 'ttl', parameters: { ttlMinutes: 60 }
  });
  await approveAction(proposal.id, { adminId: '123456' });
  assert.equal(readSafeModeSync().enabled, true);
  // expiresAt'i geçmişe çek
  globalThis.__liberteGuardianSafeMode.expiresAt = new Date(Date.now() - 1000).toISOString();
  assert.equal(readSafeModeSync().enabled, false);
});

// ---- Rollback ----

test('Safe Mode enable sonrası rollback kapatır', async () => {
  freshState();
  const proposal = await proposeAction({
    proposedAction: 'enable_safe_mode', title: 'rb', parameters: { ttlMinutes: 60 }
  });
  await approveAction(proposal.id, { adminId: '123456' });
  assert.equal(readSafeModeSync().enabled, true);
  const rb = rollbackAction(proposal.id, { adminId: '123456' });
  assert.equal(rb.ok, true);
  assert.equal(rb.proposal.status, PROPOSAL_STATUS.ROLLED_BACK);
  assert.equal(readSafeModeSync().enabled, false);
});

test('rollbackProposal Safe Mode tabanlı aksiyonu geri alır', () => {
  resetSafeMode();
  const out = rollbackProposal({ proposedAction: 'degrade_realtime' });
  assert.equal(out.ok, true);
  assert.equal(readSafeModeSync().enabled, false);
});

// ---- PII / secret maskeleme ----

test('Proposal başlık/açıklama PII ve secret içermez', () => {
  freshState();
  const p = createProposal({
    proposedAction: 'enable_safe_mode',
    title: 'Sorun re_abcd1234efgh ve test@example.com',
    description: 'DB: postgres://user:pass@host/db ve 05551234567',
    parameters: { token: 'super-secret-value', ttlMinutes: 60 }
  });
  const view = getProposal(p.id);
  assert.doesNotMatch(view.title, /re_abcd1234efgh/);
  assert.doesNotMatch(view.title, /test@example\.com/);
  assert.doesNotMatch(view.description, /postgres:\/\/user:pass/);
  assert.doesNotMatch(JSON.stringify(view.parameters), /super-secret-value/);
});

// ---- Public erişim (güvenlik) ----

test('Action listesi public erişimde 401 döner', async () => {
  const req = { method: 'GET', url: '/api/guardian/actions', query: { resource: 'actions' }, headers: {} };
  const res = createMockRes();
  await handleGuardian(req, res);
  assert.equal(res.statusCode, 401);
});

test('Action approve public erişimde 401 döner', async () => {
  const req = { method: 'POST', url: '/api/guardian/actions/x/approve', query: { resource: 'actions', op: 'approve', actionId: 'x' }, headers: {}, body: {} };
  const res = createMockRes();
  await handleGuardian(req, res);
  assert.equal(res.statusCode, 401);
});

test('Blocklist beklenen tüm riskli aksiyonları içerir', () => {
  for (const a of ['run_migration', 'deploy_production', 'delete_customer', 'modify_loyalty_balance', 'change_admin_role', 'change_env_secret']) {
    assert.ok(GUARDIAN_BLOCKED_ACTIONS.includes(a), `${a} blocklist'te olmalı`);
  }
});
