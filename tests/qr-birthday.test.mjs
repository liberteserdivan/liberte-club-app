import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createCustomerQrToken,
  formatQrPayload,
  resolveQrSigningSecret,
  verifyCustomerQrToken
} from '../api/_lib/qrToken.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('resolveQrSigningSecret dev ortamında fallback döner', () => {
  const prev = { ...process.env };
  delete process.env.QR_SIGNING_SECRET;
  delete process.env.ADMIN_PIN;
  delete process.env.VERCEL_ENV;
  process.env.NODE_ENV = 'development';

  const result = resolveQrSigningSecret();
  assert.equal(result.source, 'dev_fallback');
  assert.ok(result.secret);

  process.env = prev;
});

test('createCustomerQrToken üretir ve doğrular', () => {
  const prev = process.env.QR_SIGNING_SECRET;
  process.env.QR_SIGNING_SECRET = 'test-qr-secret-key-32chars-min';

  const issued = createCustomerQrToken(1781893223931);
  assert.ok(issued.token);
  assert.ok(issued.expiresAt > Date.now());

  const payload = formatQrPayload(issued.token);
  assert.match(payload, /^liberte-qr:v1\./);

  const verified = verifyCustomerQrToken(issued.token);
  assert.equal(verified.ok, true);
  assert.equal(verified.customerId, 1781893223931);

  process.env.QR_SIGNING_SECRET = prev;
});

test('QR generate endpoint qrPayload döndürür', () => {
  const source = readFileSync(join(root, 'api/state.js'), 'utf8');
  assert.match(source, /qrPayload/);
  assert.match(source, /qr\.generate/);
  assert.match(source, /resolveQrSigningSecret/);
  assert.match(source, /getSessionForQr/);
});

test('qrClient Bearer token ve debug meta içerir', () => {
  const source = readFileSync(join(root, 'src/lib/qrClient.js'), 'utf8');
  assert.match(source, /hasBearerToken/);
  assert.match(source, /buildQrFetchDebug/);
  assert.match(source, /QR_ENDPOINT/);
  assert.match(source, /\[qr\.frontend\]/);
  assert.match(source, /skipUnauthorized/);
});

test('apiClient token tüm platformlarda saklanır', () => {
  const source = readFileSync(join(root, 'src/lib/apiClient.js'), 'utf8');
  assert.match(source, /saveAuthToken/);
  assert.match(source, /sessionStorage\.setItem/);
  assert.match(source, /localStorage\.setItem/);
  assert.match(source, /skipUnauthorized/);
});

test('QrPage Tekrar Dene force ile yeni istek atar', () => {
  const source = readFileSync(join(root, 'src/pages/QrPage.jsx'), 'utf8');
  assert.match(source, /force: true/);
  assert.match(source, /requestGenRef/);
  assert.match(source, /String\(qrValue\)/);
  assert.match(source, /LIBERTE-QR-TEST/);
  assert.match(source, /\[qr\.frontend\]/);
});

test('auth session bootstrap sessionToken döndürür', () => {
  const source = readFileSync(join(root, 'api/_lib/handlers/authSession.js'), 'utf8');
  assert.match(source, /sessionToken/);
  const sessionJs = readFileSync(join(root, 'src/lib/session.js'), 'utf8');
  assert.match(sessionJs, /data\.sessionToken/);
  assert.match(sessionJs, /hydrateSessionTokenFromServer/);
});

test('Profil ekranında doğum günü alanı yok', () => {
  const source = readFileSync(join(root, 'src/pages/ProfilePage.jsx'), 'utf8');
  assert.doesNotMatch(source, /Doğum günü/);
  assert.doesNotMatch(source, /saveBirthDate/);
});

test('Müşteri birthDate güncellemesi engellenir', () => {
  const source = readFileSync(join(root, 'api/_lib/stateAccess.js'), 'utf8');
  assert.doesNotMatch(source, /SAFE_PROFILE_FIELDS = \[[^\]]*birthDate/);
  assert.match(source, /violations\.push\('birthDate'\)/);
});
