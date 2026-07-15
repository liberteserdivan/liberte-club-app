import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const v2 = (...parts) => join(root, 'app-v2', ...parts);

function read(rel) {
  return readFileSync(v2(rel), 'utf8');
}

test('app-v2: kritik dosyalar mevcut', () => {
  for (const rel of [
    'index.html',
    'src/main.jsx',
    'src/App.jsx',
    'src/lib/apiClient.js',
    'src/lib/sessionStore.js',
    'src/services/authService.js',
    'src/pages/LoginPage.jsx'
  ]) {
    assert.ok(existsSync(v2(rel)), rel);
  }
});

test('app-v2: apiClient native origin ve auth timeout', () => {
  const src = read('src/lib/apiClient.js');
  assert.match(read('src/lib/constants.js'), /app\.liberte\.cafe/);
  assert.match(src, /DEFAULT_API_ORIGIN/);
  assert.match(src, /AUTH_REQUEST_OPTIONS/);
  assert.match(src, /setUnauthorizedHandler/);
});

test('app-v2: sessionStore quick login API', async () => {
  const mod = await import(pathToFileURL(v2('src/lib/sessionStore.js')).href);
  assert.equal(typeof mod.hasQuickLogin, 'function');
  assert.equal(typeof mod.applyAuthResult, 'function');
  assert.equal(typeof mod.saveQuickLogin, 'function');
  const session = mod.applyAuthResult({ customerId: 1, role: 'user', isAdmin: false, sessionToken: 't' });
  assert.equal(session.customerId, 1);
});

test('app-v2: login otomatik giris UI', () => {
  const src = read('src/pages/LoginPage.jsx');
  assert.match(src, /login-auto-restore/);
  assert.match(src, /Manuel girişe geç/);
});

test('app-v2: profil push durum karti', () => {
  const src = read('src/pages/ProfilePage.jsx');
  assert.match(src, /push-device-status/);
  assert.match(src, /Bildirimleri Aç/);
});

test('app-v2: admin saglik minimal health', () => {
  const src = read('src/pages/AdminPage.jsx');
  assert.match(src, /\/api\/health/);
  assert.doesNotMatch(src, /guardian\/health/);
});

test('vite production: stabil v1 kökü + göreli base', async () => {
  // Invariant: production build app-v2 root kullanmaz (acil v1 rollback);
  // Capacitor WebView için base göreli kalır. app-v2 scaffold ayrı yaşar.
  const vite = readFileSync(join(root, 'vite.config.js'), 'utf8');
  assert.match(vite, /base:\s*["']\.\/["']/);
  assert.doesNotMatch(vite, /root:\s*["']\.\/?app-v2/);
  assert.ok(existsSync(v2('src/main.jsx')), 'app-v2 scaffold korunmali');
  const mod = await import(pathToFileURL(join(root, 'vite.config.js')).href);
  const cfg = typeof mod.default === 'function' ? mod.default() : mod.default;
  assert.equal(cfg.base, './');
});

test('phoneMask TR format', async () => {
  const mod = await import(pathToFileURL(v2('src/lib/phoneMask.js')).href);
  assert.equal(mod.formatPhoneInput('05321234567'), '0532 123 45 67');
  assert.equal(mod.formatPinInput('12ab34'), '1234');
});