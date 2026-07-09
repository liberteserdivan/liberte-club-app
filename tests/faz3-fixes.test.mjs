import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { purgeExpiredAuthData } from '../api/_lib/maintenance.js';
import { invalidateSessionsForCustomer } from '../api/_lib/auth.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

// B-10: PIN sıfırlamada diğer oturumlar iptal edilir
test('B-10: invalidateSessionsForCustomer disa aktarilir ve guard icerir', async () => {
  assert.equal(typeof invalidateSessionsForCustomer, 'function');
  // sql veya customerId yoksa sessizce doner (hata firlatmaz)
  await invalidateSessionsForCustomer(null, 5);
  await invalidateSessionsForCustomer({}, 0);
});

test('B-10: forgot-pin reset akisi oturum iptalini cagirir', () => {
  const src = read('api/_lib/handlers/authForgotPin.js');
  assert.match(src, /invalidateSessionsForCustomer\(sql, customer\.id\)/);
});

// B-9: bakım/temizlik fonksiyonu
test('B-9: purgeExpiredAuthData disa aktarilir ve sql yoksa guard eder', async () => {
  assert.equal(typeof purgeExpiredAuthData, 'function');
  await purgeExpiredAuthData(null);
});

test('B-9: logout (destroySession) hizli oturum silme kullanir', () => {
  const src = read('api/_lib/auth.js');
  assert.match(src, /runSqlSessionDelete/);
  assert.doesNotMatch(src, /purgeExpiredAuthData\(sql\)/);
});

// B-14: cookie Secure VERCEL_ENV ile kosullu
test('B-14: cookie Secure bayragi VERCEL_ENV preview/production icerir', () => {
  const src = read('api/_lib/auth.js');
  assert.match(src, /isSecureCookieEnv/);
  assert.match(src, /VERCEL_ENV === 'preview'/);
});

// Bildirim B-9: ölü SW üreticisi kaldırıldı
test('Bildirim B-9: buildFirebaseMessagingSw kaldirildi', () => {
  const src = read('api/_lib/firebaseConfig.js');
  assert.doesNotMatch(src, /export function buildFirebaseMessagingSw/);
});

// Kamera B-4: kullanıcı dostu hata mesajı
test('Kamera B-4: describeCameraError izin reddini yonlendirir', () => {
  const src = read('src/lib/qrCameraBootstrap.js');
  assert.match(src, /describeCameraError/);
  assert.match(src, /NotAllowedError/);
});

// B-5: revizyon her zaman DB'den okunur
test('B-5: loadAppStateRevision yerel onbellek sinyaline guvenmez', () => {
  const src = read('api/_lib/appState.js');
  const fnStart = src.indexOf('export async function loadAppStateRevision');
  const fnBody = src.slice(fnStart, fnStart + 600);
  assert.doesNotMatch(fnBody, /readAppStateCache/);
  assert.match(fnBody, /SELECT updated_at FROM app_state/);
});

test('B-5: cache TTL bayatlik penceresi dusuruldu (<= 10s)', () => {
  const src = read('api/_lib/appStateCache.js');
  assert.match(src, /CACHE_TTL_MS = 10_000/);
});

// Platform: sürüm hizalama
test('Platform: web/iOS/Android surumleri 1.1.31 hizali', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.version, '1.1.31');
  const gradle = read('android/app/build.gradle');
  assert.match(gradle, /versionName "1\.1\.31"/);
  const pbx = read('ios/App/App.xcodeproj/project.pbxproj');
  assert.doesNotMatch(pbx, /MARKETING_VERSION = 1\.1\.22;/);
  assert.match(pbx, /MARKETING_VERSION = 1\.1\.31;/);
});
