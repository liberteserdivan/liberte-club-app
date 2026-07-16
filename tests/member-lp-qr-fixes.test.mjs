import test from 'node:test';
import assert from 'node:assert/strict';
import { loyaltyRowToCard } from '../api/_lib/customersStore.js';
import { parseQrScanText } from '../src/lib/qrClient.js';
import { createCustomerQrToken, verifyCustomerQrToken, formatQrPayload, resolveQrSigningSecret } from '../api/_lib/qrToken.js';
import { dedupeCustomersByPhone } from '../src/lib/adminMemberSync.js';
import { pickLoyaltyCard, migrateLoyaltyCard } from '../src/lib/loyaltyPoints.js';
import { createHmac } from 'node:crypto';

test('loyaltyRowToCard bos kolon damgalari legacy damgalari ezmez', () => {
  const card = loyaltyRowToCard({
    lp_balance: 0,
    lp_lifetime: 0,
    lp_schema_version: 2,
    used_rewards: 0,
    level: 'Bronze',
    category_stamps: {},
    category_rewards: {},
    total_stamps: 0,
    available_rewards: 0,
    lifetime_stamps: 0,
    legacy_json: {
      schemaVersion: 2,
      lpBalance: 0,
      lpLifetime: 0,
      categoryStamps: { coffee: 4, dessert: 1, sandwich: 0, burger: 0 },
      categoryRewards: { coffee: 0, dessert: 0, sandwich: 0, burger: 0 }
    }
  }, 1781893223931);

  assert.equal(card.lpBalance, 6);
  assert.ok(card.lpLifetime >= 6);
});

test('loyaltyRowToCard lifetime_stamps ile sifir LP kurtarir', () => {
  const card = loyaltyRowToCard({
    lp_balance: 0,
    lp_lifetime: 0,
    lp_schema_version: 2,
    category_stamps: {},
    category_rewards: {},
    total_stamps: 0,
    lifetime_stamps: 9,
    legacy_json: { schemaVersion: 2, lpBalance: 0, lpLifetime: 0 }
  }, 1);

  assert.equal(card.lpBalance, 9);
  assert.equal(card.lpLifetime, 9);
});

test('migrateLoyaltyCard bos categoryStamps + totalStamps kurtarir', () => {
  const card = migrateLoyaltyCard({
    schemaVersion: 2,
    lpBalance: 0,
    lpLifetime: 0,
    categoryStamps: {},
    totalStamps: 5,
    lifetimeStamps: 0
  });
  assert.equal(card.lpBalance, 5);
});

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

test('migrateLoyaltyCard sema2 sifir LP iken damgalardan kurtarir', () => {
  const card = migrateLoyaltyCard({
    schemaVersion: 2,
    lpBalance: 0,
    lpLifetime: 0,
    categoryStamps: { coffee: 4, dessert: 1, sandwich: 0, burger: 0 },
    categoryRewards: { coffee: 0, dessert: 0, sandwich: 0, burger: 0 },
    lifetimeStamps: 6
  });
  assert.equal(card.lpBalance, 6);
  assert.ok(card.lpLifetime >= 6);
});

test('migrateLoyaltyCard yalniz lifetimeStamps ile bakiyeyi kurtarir', () => {
  const card = migrateLoyaltyCard({
    schemaVersion: 2,
    lpBalance: 0,
    lpLifetime: 0,
    categoryStamps: {},
    lifetimeStamps: 8
  });
  assert.equal(card.lpBalance, 8);
  assert.equal(card.lpLifetime, 8);
});

test('parseQrScanText ham v1 token ve prefix kabul eder', () => {
  const { token } = createCustomerQrToken(1781893223931);
  assert.equal(parseQrScanText(token).type, 'signed');
  assert.equal(parseQrScanText(formatQrPayload(token)).type, 'signed');
  assert.equal(parseQrScanText(` \u200B${formatQrPayload(token)} `).token, token);
});

test('parseQrScanText LC ve uye no kabul eder', () => {
  assert.equal(parseQrScanText('LC-1781893223931').type, 'memberId');
  assert.equal(parseQrScanText('1781893223931').memberId, 1781893223931);
});

test('verifyCustomerQrToken liberte-qr prefix ile calisir', () => {
  const { token } = createCustomerQrToken(1781893223931);
  const verified = verifyCustomerQrToken(formatQrPayload(token));
  assert.equal(verified.ok, true);
  assert.equal(verified.customerId, 1781893223931);
});

test('verifyCustomerQrToken allowExpired ile suresi dolmus tokeni acar', () => {
  const body = {
    v: 1,
    customerId: 1781893223931,
    exp: Date.now() - 1000,
    nonce: 'abc12345'
  };
  const newBody = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
  const sig = createHmac('sha256', resolveQrSigningSecret().secret).update(newBody).digest('base64url');
  const expiredToken = `v1.${newBody}.${sig}`;
  const denied = verifyCustomerQrToken(expiredToken);
  assert.equal(denied.ok, false);
  const allowed = verifyCustomerQrToken(expiredToken, { allowExpired: true });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.expired, true);
  assert.equal(allowed.customerId, 1781893223931);
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