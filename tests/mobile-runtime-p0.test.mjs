import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (p) => readFileSync(join(root, p), 'utf8');

test('apiClient: 401 onUnauthorized authEpoch ile korunur', () => {
  const src = read('src/lib/apiClient.js');
  assert.match(src, /getAuthEpoch\(\) === epochAtStart/);
  assert.match(src, /const epochAtStart = getAuthEpoch\(\)/);
});

test('AUTH_REQUEST_OPTIONS: tum native platformlarda 40sn', () => {
  const src = read('src/lib/apiClient.js');
  assert.match(src, /timeoutMs: isNativeApp\(\) \? NATIVE_AUTH_FETCH_TIMEOUT_MS/);
  assert.doesNotMatch(src, /isNativeApp\(\) && isIos\(\) \? NATIVE_AUTH_FETCH_TIMEOUT_MS/);
});

test('session/logout: tum token depolari temizlenir', () => {
  const src = read('src/lib/session.js');
  assert.match(src, /clearNativeAuthToken\(\)/);
  assert.match(src, /memorySession = null/);
  assert.match(src, /bumpAuthEpoch/);
});

test('apiClient clearNativeAuthToken legacy anahtarlari temizler', () => {
  const src = read('src/lib/apiClient.js');
  assert.match(src, /LEGACY_TOKEN_KEYS/);
  assert.match(src, /sessionStorage\.removeItem/);
  assert.match(src, /localStorage\.removeItem/);
});

test('LoginPage: cift submit ve attempt guard', () => {
  const src = read('src/pages/LoginPage.jsx');
  assert.match(src, /loginInFlightRef/);
  assert.match(src, /loginAttemptRef/);
  assert.match(src, /attemptId !== loginAttemptRef\.current/);
});

test('adminMemberClient: native uzun timeout ve diagnostic', () => {
  const src = read('src/lib/adminMemberClient.js');
  assert.match(src, /ADMIN_MEMBERS_REQUEST_OPTIONS/);
  assert.match(src, /error\.requestId/);
  assert.match(src, /skipUnauthorized: true/);
});

test('adminMembers handler: safe timings ve step', () => {
  const src = read('api/_lib/handlers/adminMembers.js');
  assert.match(src, /auth_ms/);
  assert.match(src, /members_query_ms/);
  assert.match(src, /step: 'admin_members_transient'/);
  assert.match(src, /requireAdminSession/);
});

test('auth readAuthToken Bearer destekler', () => {
  const src = read('api/_lib/auth.js');
  assert.match(src, /Bearer /);
});