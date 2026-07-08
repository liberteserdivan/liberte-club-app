import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveApiUrl,
  normalizeApiOrigin,
  DEFAULT_NATIVE_API_ORIGIN
} from '../src/lib/apiClient.js';

const FALLBACK = DEFAULT_NATIVE_API_ORIGIN;

// 1) Web/PWA — relative path same-origin kalır
test('Web/PWA: resolveApiUrl relative path döner (same-origin)', () => {
  assert.equal(resolveApiUrl('/api/auth/login', false), '/api/auth/login');
});

// 2) Native + env yok — kalıcı özel domain fallback kullanılır
test('Native: env yoksa kalıcı app.liberte.cafe API kökü kullanılır', () => {
  const origin = normalizeApiOrigin(undefined) || FALLBACK;
  assert.equal(origin, FALLBACK);
  assert.match(origin, /app\.liberte\.cafe/);
  assert.doesNotMatch(origin, /vercel\.app/);
  assert.equal(resolveApiUrl('/api/auth/login', true, origin), `${FALLBACK}/api/auth/login`);
});

// 3) Native + VITE_API_BASE_URL set — yeni köken kullanılır
test('Native: VITE_API_BASE_URL ayarlıysa o köken kullanılır', () => {
  const origin = normalizeApiOrigin('https://new.example.com');
  assert.equal(origin, 'https://new.example.com');
  assert.equal(
    resolveApiUrl('/api/auth/login', true, origin),
    'https://new.example.com/api/auth/login'
  );
});

// 4) Trailing slash normalize edilir
test('normalizeApiOrigin trailing slash ve path temizler', () => {
  assert.equal(normalizeApiOrigin('https://new.example.com/'), 'https://new.example.com');
  assert.equal(normalizeApiOrigin('https://new.example.com///'), 'https://new.example.com');
  assert.equal(normalizeApiOrigin('https://new.example.com/api/'), 'https://new.example.com');
});

// 5) Production'da http:// reddedilir → fallback devreye girer
test('Production: http:// reddedilir (allowInsecure=false)', () => {
  assert.equal(normalizeApiOrigin('http://insecure.example.com'), null);
  const origin = normalizeApiOrigin('http://insecure.example.com') || FALLBACK;
  assert.equal(origin, FALLBACK);
});

test('Dev: http://localhost yalnızca allowInsecure ile kabul edilir', () => {
  assert.equal(normalizeApiOrigin('http://localhost:3000'), null);
  assert.equal(
    normalizeApiOrigin('http://localhost:3000', { allowInsecure: true }),
    'http://localhost:3000'
  );
  assert.equal(normalizeApiOrigin('http://evil.example.com', { allowInsecure: true }), null);
});

// 6) Absolute URL verilirse değiştirilmez
test('resolveApiUrl absolute URL verilirse olduğu gibi döner', () => {
  assert.equal(
    resolveApiUrl('https://other.example.com/api/x', true, FALLBACK),
    'https://other.example.com/api/x'
  );
});

test('normalizeApiOrigin boş/geçersiz değeri yok sayar', () => {
  assert.equal(normalizeApiOrigin(''), null);
  assert.equal(normalizeApiOrigin('   '), null);
  assert.equal(normalizeApiOrigin(null), null);
  assert.equal(normalizeApiOrigin(123), null);
  assert.equal(normalizeApiOrigin('not a url'), null);
});
