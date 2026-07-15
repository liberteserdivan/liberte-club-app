import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function installMockStorage(initial = {}) {
  const store = { ...initial };
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  };
  return store;
}

test('PIN duz metin saklanmaz; legacy liberteDevicePin temizlenir', async () => {
  const store = installMockStorage({
    liberteDevicePin: '1234',
    liberteLastPhone: '5551112233'
  });
  const mod = await import('../src/lib/session.js');
  assert.equal(mod.readSavedPin(), '');
  mod.saveQuickLogin('5551112233', '9999');
  assert.equal(store.liberteDevicePin, undefined);
  assert.equal(store.liberteLastPhone, '5551112233');
  assert.equal(mod.hasQuickLogin(), true);
  mod.purgeLegacyDevicePin();
  assert.equal(store.liberteDevicePin, undefined);
});

test('login rate-limit fail-closed (timeoutta true)', () => {
  const source = readFileSync(join(root, 'api/_lib/handlers/authLogin.js'), 'utf8');
  assert.match(source, /rate_limit_fail_closed/);
  assert.doesNotMatch(source, /rate_limit_skip/);
  const fn = source.slice(source.indexOf('async function isLoginRateLimited'));
  const catchBlock = fn.slice(fn.indexOf('catch (error)'));
  assert.match(catchBlock.slice(0, 200), /return true/);
});

test('Android allowBackup false ve CSP report-only', () => {
  const manifest = readFileSync(join(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  assert.match(manifest, /android:allowBackup="false"/);
  const vercel = readFileSync(join(root, 'vercel.json'), 'utf8');
  assert.match(vercel, /Content-Security-Policy-Report-Only/);
});

test('register trace rawPhone yazmaz', () => {
  const source = readFileSync(join(root, 'api/_lib/handlers/authRegisterComplete.js'), 'utf8');
  assert.doesNotMatch(source, /rawPhone/);
  assert.doesNotMatch(source, /rawEmail/);
  assert.match(source, /maskPhone/);
  assert.match(source, /phoneLen/);
});

test('LoginPage otomatik PIN girisi yok', () => {
  const source = readFileSync(join(root, 'src/pages/LoginPage.jsx'), 'utf8');
  assert.match(source, /purgeLegacyDevicePin/);
  assert.doesNotMatch(source, /readSavedPin/);
  assert.doesNotMatch(source, /login-auto-restore/);
});
