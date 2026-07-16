import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

test('authLogin: minimal credential path', () => {
  const src = read('api/_lib/handlers/authLogin.js');
  assert.match(src, /findCustomerForLogin/);
  assert.doesNotMatch(src, /\bgetSession\s*\(/);
  assert.doesNotMatch(src, /getSessionIdentityForLogin/);
  assert.doesNotMatch(src, /loadAppState\s*\(/);
});

test('authLogin: createSessionOnce tek deneme', () => {
  const src = read('api/_lib/handlers/authLogin.js');
  assert.match(src, /createSessionOnce/);
  assert.doesNotMatch(src, /\bcreateSession\s*\(/);
});

test('authLogin: LOGIN_CREDENTIAL_MS bounded', () => {
  assert.match(read('api/_lib/handlers/authLogin.js'), /LOGIN_CREDENTIAL_MS/);
  assert.match(read('api/_lib/routeTiming.js'), /LOGIN_CREDENTIAL_MS:\s*18000/);
});

test('LoginPage: 503 gecici hatada bir kez daha dener', () => {
  const fn = read('src/pages/LoginPage.jsx').slice(
    read('src/pages/LoginPage.jsx').indexOf('async function loginWithPin'),
    read('src/pages/LoginPage.jsx').indexOf('function readRegisterFields')
  );
  assert.match(fn, /LOGIN_TEMPORARILY_UNAVAILABLE/);
  assert.match(fn, /postLoginWithRetry/);
  assert.match(fn, /setLoading\(false\)/);
});
