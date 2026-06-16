import assert from 'node:assert/strict';
import test from 'node:test';
import {
  customerMatchesAudience,
  getAudienceOptionState,
  getCustomerLastActivityAt,
  isActivePushSubscription,
  resolvePushAudience
} from '../src/lib/pushAudience.js';

const baseDb = {
  customers: [
    { id: 1, name: 'Ali', phone: '555', birthDate: '1990-06-10', lastVisit: '05.06.2026 10:00:00' },
    { id: 2, name: 'Ayşe', phone: '556', birthDate: '1992-03-02', lastVisit: '01.01.2025 10:00:00' },
    { id: 3, name: 'Can', phone: '557', birthDate: null, lastVisit: null }
  ],
  loyalty: {
    1: { customerId: 1, schemaVersion: 2, lpBalance: 8, lpLifetime: 80, level: 'Silver' },
    2: { customerId: 2, schemaVersion: 2, lpBalance: 20, lpLifetime: 160, level: 'Gold' },
    3: { customerId: 3, schemaVersion: 2, lpBalance: 2, lpLifetime: 2, level: 'Bronze' }
  },
  pushSubscriptions: [
    { id: 1, customerId: 1, token: 'token-a', platform: 'ios', active: true },
    { id: 2, customerId: 1, token: 'token-b', platform: 'android', active: true },
    { id: 3, customerId: 2, token: 'token-c', platform: 'android', active: true },
    { id: 4, customerId: 3, token: 'token-d', platform: 'web', active: false }
  ],
  history: [
    { customerId: 1, type: 'earn_coffee', createdAt: '05.06.2026 10:00:00' }
  ],
  checkIns: []
};

test('Silver hedefleme doğru filtreler', () => {
  const resolved = resolvePushAudience(baseDb, 'silver');
  assert.equal(resolved.targetUserCount, 1);
  assert.equal(resolved.deviceCount, 2);
  assert.deepEqual(resolved.tokens.sort(), ['token-a', 'token-b']);
});

test('Gold hedefleme doğru filtreler', () => {
  const resolved = resolvePushAudience(baseDb, 'gold');
  assert.equal(resolved.targetUserCount, 1);
  assert.deepEqual(resolved.tokens, ['token-c']);
});

test('Black hedefleme boş döner', () => {
  const resolved = resolvePushAudience(baseDb, 'black');
  assert.equal(resolved.deviceCount, 0);
});

test('Son 30 günde gelenler aktif üyeyi seçer', () => {
  const resolved = resolvePushAudience(baseDb, 'visited_30d');
  assert.equal(resolved.targetUserCount, 1);
  assert.equal(resolved.deviceCount, 2);
});

test('LP 7+ hedefi mevcut bakiyeye göre filtreler', () => {
  const resolved = resolvePushAudience(baseDb, 'lp_gte_7');
  assert.equal(resolved.targetUserCount, 2);
  assert.equal(resolved.deviceCount, 3);
});

test('Pasif token gönderime dahil edilmez', () => {
  const resolved = resolvePushAudience(baseDb, 'all');
  assert.equal(resolved.deviceCount, 3);
  assert.equal(isActivePushSubscription({ token: 'x', active: false }), false);
});

test('Native token varken aynı üyenin web tokenı gönderime alınmaz', () => {
  const db = {
    ...baseDb,
    pushSubscriptions: [
      { id: 1, customerId: 1, token: 'native-ios', platform: 'ios', channel: 'native', active: true },
      { id: 2, customerId: 1, token: 'safari-web', platform: 'web', channel: 'web', active: true },
      { id: 3, customerId: 2, token: 'token-c', platform: 'android', channel: 'native', active: true }
    ]
  };
  const resolved = resolvePushAudience(db, 'all');
  assert.deepEqual(resolved.tokens.sort(), ['native-ios', 'token-c'].sort());
});

test('Yalnızca web token varsa web kanalı kullanılır', () => {
  const db = {
    customers: [{ id: 5, name: 'Deniz', birthDate: null }],
    loyalty: { 5: { customerId: 5, schemaVersion: 2, lpBalance: 0, lpLifetime: 0, level: 'Bronze' } },
    pushSubscriptions: [
      { id: 5, customerId: 5, token: 'web-only', platform: 'web', channel: 'web', active: true }
    ],
    history: [],
    checkIns: []
  };
  const resolved = resolvePushAudience(db, 'all');
  assert.deepEqual(resolved.tokens, ['web-only']);
});

test('Aynı kullanıcının birden fazla cihazına gidebilir', () => {
  const resolved = resolvePushAudience(baseDb, 'silver');
  assert.equal(resolved.subscriptions.length, 2);
});

test('Doğum günü hedefi birthDate yoksa pasif', () => {
  const db = {
    customers: [{ id: 3, name: 'Can', birthDate: null }],
    loyalty: { 3: { customerId: 3, schemaVersion: 2, lpBalance: 0, lpLifetime: 0, level: 'Bronze' } },
    pushSubscriptions: []
  };
  const state = getAudienceOptionState(db, 'birthday_month');
  assert.equal(state.disabled, true);
});

test('Doğum günü bu ay hedefi çalışır', () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const db = {
    ...baseDb,
    customers: [{ id: 9, name: 'Deniz', birthDate: `1995-${month}-12`, lastVisit: null }],
    loyalty: { 9: { customerId: 9, schemaVersion: 2, lpBalance: 1, lpLifetime: 1, level: 'Bronze' } },
    pushSubscriptions: [{ id: 9, customerId: 9, token: 'token-z', active: true }]
  };
  const resolved = resolvePushAudience(db, 'birthday_month');
  assert.equal(resolved.deviceCount, 1);
});

test('Son aktivite tarihi history üzerinden hesaplanır', () => {
  const customer = { id: 5, lastVisit: null };
  const history = [{ customerId: 5, type: 'check_in', createdAt: '05.06.2026 12:00:00' }];
  const last = getCustomerLastActivityAt(customer, history, []);
  assert.ok(last instanceof Date);
  assert.equal(customerMatchesAudience({ id: 1 }, 'silver', baseDb), true);
});
