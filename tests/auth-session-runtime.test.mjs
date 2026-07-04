import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

test('authSession: cift withSqlRetry sarmalayici yok (10sn kok nedeni)', () => {
  const src = read('api/_lib/handlers/authSession.js');
  assert.doesNotMatch(src, /withSqlRetry\(/, 'handler icinde ikinci retry katmani olmamali');
  assert.match(src, /getSessionForBootstrap\(req\)/);
});

test('authSession: token yoksa DB oncesi 401', () => {
  const src = read('api/_lib/handlers/authSession.js');
  const noTokenIdx = src.indexOf('if (!token)');
  const sqlIdx = src.indexOf('getSessionForBootstrap(req)');
  assert.ok(noTokenIdx !== -1 && sqlIdx !== -1);
  assert.ok(noTokenIdx < sqlIdx, 'token guard DB okumasindan once');
  assert.match(src, /status\(401\)/);
});

test('authSession: gecersiz oturum 401', () => {
  const src = read('api/_lib/handlers/authSession.js');
  assert.match(src, /if \(!session\?\.customerId\)[\s\S]*status\(401\)/);
});

test('authSession: transient 503 SESSION_TEMPORARILY_UNAVAILABLE session_unavailable', () => {
  const src = read('api/_lib/handlers/authSession.js');
  assert.match(src, /session_unavailable/);
  assert.match(src, /SESSION_TEMPORARILY_UNAVAILABLE/);
  assert.match(src, /status\(503\)/);
});

test('authSession: loadAppState veya syncSessionWithCustomer cagirmaz', () => {
  const src = read('api/_lib/handlers/authSession.js');
  assert.doesNotMatch(src, /loadAppState/);
  assert.doesNotMatch(src, /syncSessionWithCustomer/);
});

test('getSessionForBootstrap: runSqlSessionBootstrap kullanir', () => {
  const src = read('api/_lib/auth.js');
  const fn = src.slice(src.indexOf('export async function getSessionForBootstrap'), src.indexOf('export async function invalidateCurrentSession'));
  assert.match(fn, /runSqlSessionBootstrap/);
  assert.doesNotMatch(fn, /\bsyncSessionWithCustomer\s*\(/);
  assert.doesNotMatch(fn, /\bloadAppState\s*\(/);
});

test('runSqlSessionBootstrap: transient timeout 4sn altinda fail eder', async () => {
  const { runSqlSessionBootstrap } = await import('../api/_lib/runSql.js');
  const hung = () => new Promise(() => {});
  const t0 = Date.now();
  await assert.rejects(() => runSqlSessionBootstrap(hung));
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 4000, `beklenen <4000ms, gercek ${elapsed}ms`);
});

test('bootstrapSession: 401 normal null (modal yok)', () => {
  const src = read('src/lib/session.js');
  const fn = src.slice(src.indexOf('export async function bootstrapSession'), src.indexOf('export async function hydrateSessionTokenFromServer'));
  assert.match(fn, /response\.status === 401/);
  assert.match(fn, /return null/);
  assert.doesNotMatch(fn, /Sunucuya ulaşılamadı/);
});

test('bootstrapSession: 503 sessionUnavailable doner', () => {
  const src = read('src/lib/session.js');
  assert.match(src, /sessionUnavailable:\s*true/);
  assert.match(src, /SESSION_TEMPORARILY_UNAVAILABLE/);
});

test('App: sessionUnavailable authNotice ile giris formu acik kalir', () => {
  const src = read('src/App.jsx');
  assert.match(src, /result\?\.sessionUnavailable/);
  assert.match(src, /setAuthNotice/);
});

test('auth.js: GET session token yoksa withSqlRequest oncesi 401 (504 kok nedeni)', () => {
  const src = read('api/auth.js');
  assert.match(src, /readSessionTokenQuick/);
  assert.match(src, /respondSessionNoToken/);
  const bypassIdx = src.indexOf("action === 'session'");
  const quickIdx = src.indexOf('readSessionTokenQuick(req)');
  const sqlHandlerIdx = src.indexOf('return sqlHandler(req, res)');
  assert.ok(bypassIdx !== -1 && quickIdx !== -1);
  assert.ok(bypassIdx < sqlHandlerIdx, 'session bypass sqlHandler dan once');
  assert.match(src, /withSqlRequestNoGuardian/);
  assert.doesNotMatch(src.slice(0, src.indexOf('const sqlHandler')), /hydrateGuardianState/);
});

test('auth.js: no-token path getSql veya hydrateGuardianState cagirmaz', () => {
  const src = read('api/auth.js');
  const fn = src.slice(src.indexOf('function respondSessionNoToken'), src.indexOf('const AUTH_ACTIONS'));
  assert.doesNotMatch(fn, /\bgetSql\b/);
  assert.doesNotMatch(fn, /withSqlRequest/);
  assert.doesNotMatch(fn, /runHandlerWithSql/);
  assert.doesNotMatch(fn, /hydrateGuardianState/);
  assert.match(fn, /status\(401\)/);
});

test('authSession: rota deadline guard var (platform timeout onleme, 4sn)', () => {
  const src = read('api/_lib/handlers/authSession.js');
  assert.match(src, /ROUTE_TIMING\.SESSION_WITH_TOKEN_MS/);
  assert.match(src, /withRouteDeadline/);
  assert.match(src, /isRouteDeadlineError/);
  const timing = read('api/_lib/routeTiming.js');
  assert.match(timing, /SESSION_WITH_TOKEN_MS:\s*4000/);
});

test('auth.js: login withSqlRequestNoGuardian kullanir (guardian izolasyonu)', () => {
  const src = read('api/auth.js');
  assert.match(src, /action === 'login'/);
  assert.match(src, /loginSqlHandler/);
  assert.match(src, /withSqlRequestNoGuardian/);
});

test('sqlRequest: withSqlRequestNoGuardian hydrate atlar', () => {
  const src = read('api/_lib/sqlRequest.js');
  assert.match(src, /export function withSqlRequestNoGuardian/);
  assert.match(src, /hydrateGuardian:\s*false/);
});

test('loyalty daily-claim guardian hydrate kullanmaz', () => {
  const src = read('api/loyalty.js');
  assert.match(src, /withSqlRequestNoGuardian/);
  assert.doesNotMatch(src, /withSqlRequest\(/);
});

test('authLogin: transient/deadline 503 LOGIN_TEMPORARILY_UNAVAILABLE', () => {
  const handler = read('api/_lib/handlers/authLogin.js');
  const phaseLib = read('api/_lib/loginPhase.js');
  assert.match(phaseLib, /LOGIN_TEMPORARILY_UNAVAILABLE/);
  assert.match(handler, /LOGIN_CREDENTIAL_MS/);
  assert.match(handler, /unavailableBody/);
  assert.doesNotMatch(handler, /step:\s*'login_unavailable'/);
  assert.doesNotMatch(phaseLib, /step:\s*'login_unavailable'/);
  const timing = read('api/_lib/routeTiming.js');
  assert.match(timing, /LOGIN_CREDENTIAL_MS:\s*6000/);
});

test('App: musteri hydrate timeout logout yapmaz degraded mod', () => {
  const src = read('src/App.jsx');
  assert.match(src, /bootstrapSnapshotRef/);
  assert.doesNotMatch(src, /Hesap bilgilerin yüklenemedi\. Lütfen tekrar giriş yap/);
  assert.match(src, /Önbellekteki verilerle devam ediliyor/);
});

test('guardianHydrate: bounded timeout (musteri cekirdegi bloklanmaz)', () => {
  const src = read('api/_lib/guardian/guardianHydrate.js');
  assert.match(src, /withRouteDeadline/);
  assert.match(src, /GUARDIAN_HYDRATE_MS/);
});