import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

test('authLogin: getSessionIdentityForLogin, loadAppState yok', () => {
  const src = read('api/_lib/handlers/authLogin.js');
  assert.match(src, /getSessionIdentityForLogin/);
  assert.doesNotMatch(src, /\bgetSession\s*\(/);
  assert.doesNotMatch(src, /loadAppState\s*\(/);
});

test('authLogin: createSessionOnce tek deneme', () => {
  const src = read('api/_lib/handlers/authLogin.js');
  assert.match(src, /createSessionOnce/);
  assert.doesNotMatch(src, /\bcreateSession\s*\(/);
});

test('authLogin: runSqlLoginRead bounded', () => {
  assert.match(read('api/_lib/handlers/authLogin.js'), /runSqlLoginRead/);
  assert.match(read('api/_lib/routeTiming.js'), /LOGIN_MS:\s*6000/);
});

test('authLogin: enrichment failure still plain body', () => {
  const src = read('api/_lib/handlers/authLogin.js');
  assert.match(src, /buildPlainLoginBody/);
  assert.match(src, /createSessionOnce[\s\S]*buildLoginSuccessBody[\s\S]*buildPlainLoginBody/);
});

test('LoginPage: 503 tek deneme, loading kapanir', () => {
  const fn = read('src/pages/LoginPage.jsx').slice(
    read('src/pages/LoginPage.jsx').indexOf('async function loginWithPin'),
    read('src/pages/LoginPage.jsx').indexOf('function readRegisterFields')
  );
  assert.doesNotMatch(fn, /for \(let attempt/);
  assert.match(fn, /LOGIN_TEMPORARILY_UNAVAILABLE/);
  assert.match(fn, /setLoading\(false\)/);
});

test('runSqlLoginRead under 6s on hang', async () => {
  const { runSqlLoginRead } = await import('../api/_lib/runSql.js');
  const t0 = Date.now();
  await assert.rejects(() => runSqlLoginRead(() => new Promise(() => {})));
  assert.ok(Date.now() - t0 < 6000);
});
