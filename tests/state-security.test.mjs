/**
 * Müşteri tarafı state yazma güvenliği — saf fonksiyon testleri.
 * Çalıştır: node tests/state-security.test.mjs
 */
import assert from 'node:assert/strict';
import {
  findCustomerWriteViolations,
  mergeUserState,
  mergeAdminState,
  filterStateForUser
} from '../api/_lib/stateAccess.js';

const CUSTOMER_ID = 900001;

// HTTP sınırını taklit et — client, sunucu state'inin bağımsız kopyasını alır
function clientView(canonical) {
  return structuredClone(filterStateForUser(canonical, CUSTOMER_ID));
}

// Temel kanonik (sunucu) durumu
function baseState() {
  return {
    settings: { cafe_name: 'Liberte', cashier_pin: '5454' },
    customers: [
      { id: CUSTOMER_ID, phone: '5550100001', name: 'Demo', email: 'demo@liberte.cafe', isAdmin: false, birthDate: '' },
      { id: 1, phone: '5058665406', name: 'Admin', email: 'admin@liberte.cafe', isAdmin: true }
    ],
    loyalty: {
      [CUSTOMER_ID]: { customerId: CUSTOMER_ID, totalStamps: 2, categoryStamps: { coffee: 2, dessert: 0, burger: 0 }, availableRewards: 0 }
    },
    history: [{ id: 10, customerId: CUSTOMER_ID, type: 'stamp_add', count: 1 }],
    wheelSpins: [],
    couponUses: [],
    pushSubscriptions: [],
    feedback: []
  };
}

let passed = 0;
function check(label, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${label}`);
}

console.log('Güvenlik testleri:');

// 1) Müşteri kendi damgasını artırmaya çalışırsa ihlal tespit edilmeli
check('loyalty manipülasyonu 403 tetikler', () => {
  const canonical = baseState();
  const client = clientView(canonical);
  client.loyalty[CUSTOMER_ID].totalStamps = 99;
  client.loyalty[CUSTOMER_ID].categoryStamps.coffee = 99;
  const violations = findCustomerWriteViolations(canonical, client, CUSTOMER_ID);
  assert.ok(violations.includes('loyalty'), 'loyalty ihlali bekleniyordu');
});

// 2) Yönetici yetkisi yükseltme denemesi ihlal olmalı
check('isAdmin yükseltme 403 tetikler', () => {
  const canonical = baseState();
  const client = clientView(canonical);
  client.customers[0].isAdmin = true;
  const violations = findCustomerWriteViolations(canonical, client, CUSTOMER_ID);
  assert.ok(violations.includes('isAdmin'), 'isAdmin ihlali bekleniyordu');
});

// 3) Çark/ödül satırı ekleme denemesi ihlal olmalı
check('wheelSpins ekleme 403 tetikler', () => {
  const canonical = baseState();
  const client = clientView(canonical);
  client.wheelSpins = [{ id: 1, customerId: CUSTOMER_ID, prize: 'stamp', value: 3 }];
  const violations = findCustomerWriteViolations(canonical, client, CUSTOMER_ID);
  assert.ok(violations.includes('wheelSpins'), 'wheelSpins ihlali bekleniyordu');
});

// 4) Geçmiş (history) değiştirme denemesi ihlal olmalı
check('history değiştirme 403 tetikler', () => {
  const canonical = baseState();
  const client = clientView(canonical);
  client.history = [{ id: 99, customerId: CUSTOMER_ID, type: 'stamp_add', count: 50 }];
  const violations = findCustomerWriteViolations(canonical, client, CUSTOMER_ID);
  assert.ok(violations.includes('history'), 'history ihlali bekleniyordu');
});

// 5) Sadece profil güncelleme ihlal üretmemeli
check('güvenli profil güncelleme ihlal üretmez', () => {
  const canonical = baseState();
  const client = clientView(canonical);
  client.customers[0].name = 'Yeni Ad';
  client.customers[0].email = 'yeni@liberte.cafe';
  const violations = findCustomerWriteViolations(canonical, client, CUSTOMER_ID);
  assert.equal(violations.length, 0, `ihlal beklenmiyordu: ${violations}`);
});

// 6) mergeUserState loyalty'yi ASLA yazmaz, profil alanlarını uygular
check('mergeUserState loyalty yazmaz, profili uygular', () => {
  const canonical = baseState();
  const client = clientView(canonical);
  client.loyalty[CUSTOMER_ID].totalStamps = 99;
  client.customers[0].name = 'Güvenli Ad';
  const merged = mergeUserState(canonical, client, CUSTOMER_ID);
  assert.equal(merged.loyalty[CUSTOMER_ID].totalStamps, 2, 'loyalty değişmemeliydi');
  const me = merged.customers.find((c) => c.id === CUSTOMER_ID);
  assert.equal(me.name, 'Güvenli Ad', 'isim güncellenmeliydi');
  assert.equal(me.isAdmin, false, 'isAdmin korunmalıydı');
});

// 7) mergeUserState ile müşteri kendini admin yapamaz
check('mergeUserState isAdmin yükseltmeyi yok sayar', () => {
  const canonical = baseState();
  const client = clientView(canonical);
  client.customers[0].isAdmin = true;
  const merged = mergeUserState(canonical, client, CUSTOMER_ID);
  const me = merged.customers.find((c) => c.id === CUSTOMER_ID);
  assert.equal(me.isAdmin, false, 'isAdmin false kalmalıydı');
});

// 8) Müşteri kendi push aboneliğini ve geri bildirimini ekleyebilir
check('güvenli pushSubscriptions/feedback güncellenebilir', () => {
  const canonical = baseState();
  const client = clientView(canonical);
  client.pushSubscriptions = [{ id: 1, customerId: CUSTOMER_ID, token: 'abc' }];
  client.feedback = [{ id: 1, customerId: CUSTOMER_ID, rating: 5 }];
  const merged = mergeUserState(canonical, client, CUSTOMER_ID);
  assert.equal(merged.pushSubscriptions.length, 1, 'push aboneliği eklenmeliydi');
  assert.equal(merged.feedback.length, 1, 'geri bildirim eklenmeliydi');
});

// 9) Admin yazımında cashier_pin korunur
check('mergeAdminState cashier_pin korur', () => {
  const canonical = baseState();
  // Admin client cashier_pin görmez (filtrelenir); yine de kaybolmamalı
  const adminClient = { settings: { cafe_name: 'Liberte 2' }, customers: canonical.customers };
  const merged = mergeAdminState(canonical, adminClient);
  assert.equal(merged.settings.cashier_pin, '5454', 'cashier_pin korunmalıydı');
  assert.equal(merged.settings.cafe_name, 'Liberte 2', 'cafe_name güncellenmeliydi');
});

check('mergeAdminState tek müşterilik istemci tüm üyeleri silmez', () => {
  const canonical = baseState();
  const partialClient = {
    settings: canonical.settings,
    customers: [canonical.customers[0]]
  };
  const merged = mergeAdminState(canonical, partialClient);
  assert.equal(merged.customers.length, canonical.customers.length, 'üye sayısı korunmalıydı');
});

// 10) filterStateForUser başka üyelerin verisini sızdırmaz
check('filterStateForUser başka üye verisi sızdırmaz', () => {
  const canonical = baseState();
  const client = clientView(canonical);
  assert.equal(client.customers.length, 1, 'sadece kendi kaydı dönmeli');
  assert.equal(client.customers[0].id, CUSTOMER_ID);
  assert.equal(client.customers[0].isAdmin, undefined, 'isAdmin sızdırılmamalı');
  assert.equal(client.settings.cashier_pin, undefined, 'cashier_pin sızdırılmamalı');
});

console.log(`\nTüm güvenlik testleri geçti (${passed}/11).`);
