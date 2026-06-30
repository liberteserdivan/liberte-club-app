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