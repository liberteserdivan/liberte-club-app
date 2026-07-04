import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (p) => readFileSync(join(root, p), 'utf8');

test('apiClient: native Bearer + credentials omit, web credentials include', () => {
  const src = read('src/lib/apiClient.js');
  assert.match(src, /credentials: native \? 'omit' : 'include'/);
  assert.match(src, /headers\.Authorization = `Bearer \$\{token\}`/);
  assert.match(src, /FALLBACK_NATIVE_API_ORIGIN = 'https:\/\/app\.liberte\.cafe'/);
});

test('session: native sessionToken storage + bootstrap skipUnauthorized', () => {
  const src = read('src/lib/session.js');
  assert.match(src, /saveNativeAuthToken\(data\.sessionToken\)/);
  assert.match(src, /skipUnauthorized: true/);
});

test('firebasePush: register-device login bloklamaz', () => {
  const src = read('src/lib/firebasePush.js');
  assert.match(src, /skipUnauthorized: true/);
  assert.match(src, /PUSH_REGISTER_TIMEOUT_MS/);
  assert.match(src, /canAttempt\(PUSH_CIRCUIT_KEY\)/);
});

test('App: state hydrate timeout login ekranini kilitlemez', () => {
  const src = read('src/App.jsx');
  assert.match(src, /CUSTOMER_HYDRATE_MS/);
  assert.match(src, /bootstrapSnapshotRef/);
});

test('migrateLoyaltyCard: double-encoded categoryStamps crash etmez', async () => {
  const { migrateLoyaltyCard } = await import('../src/lib/loyaltyPoints.js');
  const encoded = JSON.stringify({ coffee: 3, dessert: 0, sandwich: 0, burger: 0 });
  assert.doesNotThrow(() => migrateLoyaltyCard({
    customerId: 1,
    categoryStamps: encoded,
    categoryRewards: encoded
  }));
});

test('capacitor: production API codemagic vars', () => {
  const yaml = read('codemagic.yaml');
  assert.match(yaml, /VITE_API_BASE_URL.*app\.liberte\.cafe/);
  const cap = JSON.parse(read('capacitor.config.json'));
  assert.equal(cap.webDir, 'dist');
  assert.equal(cap.appId, 'cafe.liberte.app');
});

test('apiClient: production token prefix log sinirli', () => {
  const src = read('src/lib/apiClient.js');
  assert.match(src, /prefix: token \? `\$\{token\.slice\(0, 6\)/);
  assert.doesNotMatch(src, /console\.(log|info).*sessionToken/);
});