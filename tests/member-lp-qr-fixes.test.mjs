import test from 'node:test';
import assert from 'node:assert/strict';
import { loyaltyRowToCard } from '../api/_lib/customersStore.js';
import { parseQrScanText } from '../src/lib/qrClient.js';
import { createCustomerQrToken, verifyCustomerQrToken, formatQrPayload } from '../api/_lib/qrToken.js';
import { dedupeCustomersByPhone } from '../src/lib/adminMemberSync.js';
import { pickLoyaltyCard } from '../src/lib/loyaltyPoints.js';

test('loyaltyRowToCard kolon LP tercih eder — bayat legacy_json ezmez', () => {
  const card = loyaltyRowToCard({
    lp_balance: 12,
    lp_lifetime: 20,
    lp_schema_version: 2,
    used_rewards: 0,
    level: 'Bronze',
    category_stamps: {},
    category_rewards: {},
    total_stamps: 0,
    available_rewards: 0,
    lifetime_stamps: 0,
    legacy_json: { schemaVersion: 2, lpBalance: 0, lpLifetime: 0 }
  }, 1781893223931);

  assert.equal(card.lpBalance, 12);
  assert.equal(card.lpLifetime, 20);
});

test('loyaltyRowToCard bos legacy_json kolonlari kullanir', () => {
  const card = loyaltyRowToCard({
    lp_balance: 5,
    lp_lifetime: 5,
    lp_schema_version: 2,
    legacy_json: {}
  }, 1);
  assert.equal(card.lpBalance, 5);
});

test('parseQrScanText ham v1 token ve prefix kabul eder', () => {
  const { token } = createCustomerQrToken(1781893223931);
  assert.equal(parseQrScanText(token).type, 'signed');
  assert.equal(parseQrScanText(formatQrPayload(token)).type, 'signed');
  assert.equal(parseQrScanText(` \u200B${formatQrPayload(token)} `).token, token);
});

test('verifyCustomerQrToken liberte-qr prefix ile calisir', () => {
  const { token } = createCustomerQrToken(1781893223931);
  const verified = verifyCustomerQrToken(formatQrPayload(token));
  assert.equal(verified.ok, true);
  assert.equal(verified.customerId, 1781893223931);
});

test('dedupeCustomersByPhone kisa telefonlu uyeyi dusurmez', () => {
  const list = dedupeCustomersByPhone([
    { id: 1781893223931, name: 'Test', phone: '12', isAdmin: false },
    { id: 2, name: 'Uye', phone: '5550100001', isAdmin: false }
  ]);
  assert.equal(list.length, 2);
  assert.ok(list.some((row) => Number(row.id) === 1781893223931));
});

test('pickLoyaltyCard string/number anahtar okur', () => {
  const map = { '1781893223931': { lpBalance: 7 } };
  assert.equal(pickLoyaltyCard(map, 1781893223931).lpBalance, 7);
});
