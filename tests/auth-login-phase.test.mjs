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
  assert.match(src, /unavailableBody\([\s\S]*'session_create'/);
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

test('authLogin: credential yolunda primeSqlConnection YOK', () => {
  const src = read('api/_lib/handlers/authLogin.js');
  assert.doesNotMatch(src, /primeSqlConnection/);
  assert.match(src, /resolveLoginOutcome/);
  assert.doesNotMatch(src, /runSqlLoginRead/);
});

test('authLogin: LOGIN_READ_ATTEMPT_MS 10000ms', () => {
  assert.match(read('api/_lib/routeTiming.js'), /LOGIN_READ_ATTEMPT_MS:\s*10000/);
});

test('authLogin: rate limit paralel Promise.all', () => {
  const src = read('api/_lib/handlers/authLogin.js');
  assert.match(src, /Promise\.all\([\s\S]*isLoginRateLimited/);
  assert.match(src, /recordRateLimitMs/);
});

test('authLogin: credential_lookup 503 db_error_type query_timeout', async () => {
  const { createLoginPhaseTracker } = await import('../api/_lib/loginPhase.js');
  const trace = { requestId: 'test-req', successTimings: () => ({ parse_body_ms: 900 }) };
  const phases = createLoginPhaseTracker(trace, 6000);
  phases.setPhase('credential_lookup');
  const err = Object.assign(new Error('ETIMEDOUT: sql attempt timeout'), { code: 'ETIMEDOUT' });
  const body = phases.unavailableBody('credential_lookup', 'LOGIN_TEMPORARILY_UNAVAILABLE', {
    error: err,
    queryTimeoutMs: 4000
  });
  assert.equal(body.step, 'credential_lookup');
  assert.equal(body.timings.db_error_type, 'query_timeout');
  assert.equal(body.timings.query_timeout_ms, 4000);
  assert.doesNotMatch(JSON.stringify(body), /login_unavailable/);
});

test('findCustomerForLogin: OR yerine indeksli iki adim', () => {
  const src = read('api/_lib/customersStore.js');
  const fn = src.slice(src.indexOf('export async function findCustomerForLogin'), src.indexOf('export async function findCustomerByPhone'));
  assert.match(fn, /normalized_phone = \$\{normalized\}/);
  assert.doesNotMatch(fn, /OR phone IN/);
});

test('classifyLoginDbError: guvenli siniflar', async () => {
  const { classifyLoginDbError } = await import('../api/_lib/dbTransient.js');
  const timeoutErr = Object.assign(new Error('ETIMEDOUT: sql attempt timeout'), { code: 'ETIMEDOUT' });
  assert.equal(classifyLoginDbError(timeoutErr), 'query_timeout');
  assert.equal(classifyLoginDbError(null, { routeDeadline: true }), 'route_deadline');
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
