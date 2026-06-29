import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveApiUrl, normalizeApiOrigin } from '../src/lib/apiClient.js';

const FALLBACK = 'https://app.liberte.cafe';

// 1) Web/PWA — relative path same-origin kalır
test('Web/PWA: resolveApiUrl relative path döner (same-origin)', () => {
  assert.equal(resolveApiUrl('/api/auth/login', false), '/api/auth/login');
});

// 2) Native + env yok — production fallback kullanılır
test('Native: env yoksa app.liberte.cafe kökü kullanılır', () => {
  const origin = normalizeApiOrigin(undefined) || FALLBACK;
  assert.equal(origin, FALLBACK);
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
  // Path verilse de yalnızca köken döner
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
  // localhost dışı http dev'de bile reddedilir
  assert.equal(normalizeApiOrigin('http://evil.example.com', { allowInsecure: true }), null);
});

// 6) Absolute URL verilirse değiştirilmez
test('resolveApiUrl absolute URL verilirse olduğu gibi döner', () => {
  assert.equal(
    resolveApiUrl('https://other.example.com/api/x', true, FALLBACK),
    'https://other.example.com/api/x'
  );
  assert.equal(
    resolveApiUrl('http://other.example.com/api/x', false, FALLBACK),
    'http://other.example.com/api/x'
  );
});

// Boş/geçersiz değer null döner
test('normalizeApiOrigin boş/geçersiz değeri yok sayar', () => {
  assert.equal(normalizeApiOrigin(''), null);
  assert.equal(normalizeApiOrigin('   '), null);
  assert.equal(normalizeApiOrigin(null), null);
  assert.equal(normalizeApiOrigin(123), null);
  assert.equal(normalizeApiOrigin('not a url'), null);
});
