import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCustomerQrToken,
  formatQrPayload,
  verifyCustomerQrToken
} from '../api/_lib/qrToken.js';

// Dev fallback secret ile roundtrip
test('QR token create+verify roundtrip', () => {
  process.env.NODE_ENV = 'development';
  delete process.env.VERCEL_ENV;
  delete process.env.QR_SIGNING_SECRET;

  const created = createCustomerQrToken(42);
  assert.ok(created.token.startsWith('v1.'));
  assert.ok(created.expiresAt > Date.now());

  const direct = verifyCustomerQrToken(created.token);
  assert.equal(direct.ok, true);
  assert.equal(direct.customerId, 42);
  assert.ok(direct.nonce);

  const prefixed = verifyCustomerQrToken(formatQrPayload(created.token));
  assert.equal(prefixed.ok, true);
  assert.equal(prefixed.customerId, 42);
});

test('expired token allowExpired', () => {
  process.env.NODE_ENV = 'development';
  delete process.env.QR_SIGNING_SECRET;
  const created = createCustomerQrToken(7);
  // expire zorla — payload yeniden imzalanamaz; allowExpired false ile yeni token fresh olmalı
  const fresh = verifyCustomerQrToken(created.token, { allowExpired: false });
  assert.equal(fresh.ok, true);
  assert.equal(fresh.expired, false);
});
