import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatClientApiError } from '../src/lib/apiErrors.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

test('503 SERVICE_UNAVAILABLE Sunucuya ulasilamadi demez', () => {
  const r = formatClientApiError({
    response: { status: 503 },
    data: { code: 'SESSION_TEMPORARILY_UNAVAILABLE', error: 'Oturum gecici olarak alinamiyor.' }
  });
  assert.doesNotMatch(r.message, /Sunucuya ulaşılamadı/);
  assert.equal(r.retryable, true);
});

test('401 formatClientApiError oturum mesaji uretir (unreachable degil)', () => {
  const r = formatClientApiError({
    response: { status: 401 },
    data: { message: 'Oturum gerekli' }
  });
  assert.doesNotMatch(r.message, /Sunucuya ulaşılamadı/);
  assert.match(r.message, /Oturum/);
});

test('LoginPage timeout modal Sunucuya ulasilamadi kullanmaz', () => {
  const src = read('src/pages/LoginPage.jsx');
  const block = src.slice(src.indexOf('function notifyRequestError'), src.indexOf('function readApiError'));
  assert.match(block, /FETCH_TIMEOUT/);
  assert.match(block, /humanizeNetworkFailure/);
  assert.doesNotMatch(block, /Sunucuya ulaşılamadı/);
});

test('LoginPage auth istekleri skipUnauthorized kullanir', () => {
  const src = read('src/pages/LoginPage.jsx');
  assert.match(src, /skipUnauthorized:\s*true/);
});

test('bootstrapSession 401 sessiz null (modal yok)', () => {
  const src = read('src/lib/session.js');
  const fn = src.slice(src.indexOf('function resolveBootstrapAttempt'), src.indexOf('export async function bootstrapSession'));
  assert.match(fn, /response\.status === 401/);
  assert.doesNotMatch(fn, /Sunucuya ulaşılamadı/);
  assert.doesNotMatch(fn, /reportError/);
});

test('Login modal kaynagi noticeModal + notify', () => {
  const src = read('src/pages/LoginPage.jsx');
  assert.match(src, /noticeModal/);
  assert.match(src, /notifyRequestError/);
});