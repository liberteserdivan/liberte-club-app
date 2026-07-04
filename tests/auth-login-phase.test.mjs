import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

test('authLogin: faz izleme loginPhase + unavailableBody', () => {
  const src = read('api/_lib/handlers/authLogin.js');
  assert.match(src, /createLoginPhaseTracker/);
  assert.match(src, /unavailableBody/);
  assert.doesNotMatch(src, /step:\s*'login_unavailable'/);
});

test('authLogin: route deadline credential_lookup step', () => {
  const src = read('api/_lib/handlers/authLogin.js');
  assert.match(src, /LOGIN_CREDENTIAL_MS/);
  assert.match(src, /getPhase:\s*\(\)\s*=>\s*phases\.getPhase\(\)/);
  assert.match(src, /error\?\.phase/);
});

test('authLogin: session_create 503 step', () => {
  const src = read('api/_lib/handlers/authLogin.js');
  assert.match(src, /unavailableBody\('session_create'\)/);
});

test('authLogin: enrichment credential deadline disinda', () => {
  const src = read('api/_lib/handlers/authLogin.js');
  const credentialEnd = src.indexOf('LOGIN_CREDENTIAL_MS');
  const enrichIdx = src.indexOf("phases.setPhase('response_enrichment')");
  const deadlineClose = src.indexOf('}, ROUTE_TIMING.LOGIN_CREDENTIAL_MS');
  assert.ok(enrichIdx > deadlineClose, 'enrichment credential deadline sonrasi');
  assert.ok(credentialEnd !== -1);
});

test('authLogin: enrichment failure 200 plain body', () => {
  const src = read('api/_lib/handlers/authLogin.js');
  assert.match(src, /response_enrichment[\s\S]*buildLoginSuccessBody[\s\S]*buildPlainLoginBody/);
});

test('authLogin: credential lookup minimal findCustomerForLogin', () => {
  const src = read('api/_lib/handlers/authLogin.js');
  assert.match(src, /findCustomerForLogin/);
  assert.doesNotMatch(src, /loadAppState/);
  assert.doesNotMatch(src, /syncSessionWithCustomer/);
  assert.doesNotMatch(src, /getSessionIdentityForLogin/);
});

test('withRouteDeadline: phase error payload', async () => {
  const { withRouteDeadline, isRouteDeadlineError } = await import('../api/_lib/routeDeadline.js');
  let phase = 'credential_lookup';
  try {
    await withRouteDeadline(() => new Promise(() => {}), 50, 'test', { getPhase: () => phase });
    assert.fail('deadline bekleniyordu');
  } catch (e) {
    assert.equal(isRouteDeadlineError(e), true);
    assert.equal(e.phase, 'credential_lookup');
  }
});
