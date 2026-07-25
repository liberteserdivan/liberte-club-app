import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canAttempt, recordFailure, resetCircuit } from '../src/lib/backgroundCircuit.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

test('GET /api/state saveAppState cagirmaz', () => {
  const src = read('api/state.js');
  const getStart = src.indexOf("if (req.method === 'GET')");
  const postStart = src.indexOf("if (req.method === 'POST')");
  const getBlock = src.slice(getStart, postStart);
  assert.doesNotMatch(getBlock, /await saveAppState|runSql\(\(\) => saveAppState/);
});

test('GET /api/state hafif oturum dogrulamasi kullanir (getSessionForQr)', () => {
  const src = read('api/state.js');
  assert.match(src, /getSessionForQr\(req\)/);
  assert.doesNotMatch(src, /getSessionForBootstrap\(req\)/);
});

test('musteri GET tam admin state yuklemez', () => {
  const src = read('api/state.js');
  assert.match(
    src,
    /loadAppStateForCustomer\(session\.customerId,\s*\{\s*skipPersist:\s*true\s*\}\)/
  );
});

test('loadAppStateForCustomer legacy yolunda filterStateForUser ile dilimler', () => {
  const src = read('api/_lib/appState.js');
  assert.match(src, /filterStateForUser\(remote\.data, id\)/);
});

test('/api/state gecici DB hatasi 503 STATE_TEMPORARILY_UNAVAILABLE', () => {
  const src = read('api/state.js');
  assert.match(src, /STATE_TEMPORARILY_UNAVAILABLE/);
  assert.match(src, /status\(503\)/);
});

test('daily-claim kapalı — LP basmaz', () => {
  const src = read('api/_lib/handlers/customerLoyaltyClaim.js');
  assert.match(src, /DAILY_CLAIM_DISABLED/);
  assert.match(src, /status\(410\)/);
  assert.doesNotMatch(src, /loyalty: result\.loyalty/);
  assert.doesNotMatch(src, /applyDailyLoginRewardRelational/);
});

test('customerRewardsClient throw etmez', () => {
  const src = read('src/lib/customerRewardsClient.js');
  assert.doesNotMatch(src, /\bthrow\b/);
});

test('admin members musteri state sync ini bozmaz', () => {
  const app = read('src/App.jsx');
  assert.match(app, /useAdminMembers\(\{/);
  const hook = read('src/hooks/useAdminMembers.js');
  assert.match(hook, /ADMIN_MEMBERS_CIRCUIT/);
  assert.match(hook, /inFlightRef\.current/);
});

test('adminMemberClient skipUnauthorized', () => {
  const src = read('src/lib/adminMemberClient.js');
  assert.match(src, /skipUnauthorized:\s*true/);
});

test('loadRemote skipUnauthorized', () => {
  const src = read('src/lib/db.js');
  const fn = src.slice(src.indexOf('export async function loadRemote'), src.indexOf('export async function saveRemote'));
  assert.match(fn, /skipUnauthorized:\s*true/);
});

test('useCommit 503 transient degraded mod', () => {
  const src = read('src/hooks/useCommit.js');
  assert.match(src, /status:\s*'degraded'/);
  assert.match(src, /remote\?\.transient/);
});

test('remoteFetch GET /api/state tekillestirme', () => {
  const src = read('src/lib/remoteFetch.js');
  assert.match(src, /inflightStateRequest/);
  assert.match(src, /isDedupableStateRead/);
});

test('503 sonrasi admin-members circuit retry storm durdurur', () => {
  const key = 'prod-stab-admin-members';
  resetCircuit(key);
  recordFailure(key);
  recordFailure(key);
  recordFailure(key);
  assert.equal(canAttempt(key), false);
  resetCircuit(key);
});