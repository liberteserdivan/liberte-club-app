import assert from 'node:assert/strict';
import test from 'node:test';
import {
  levelByLp,
  getLevelProgress,
  migrateLoyaltyCard
} from '../src/lib/loyaltyPoints.js';
import {
  canUseMonthlyDiscount,
  currentMonthKey,
  getMembershipView,
  getTierDiscountPercent,
  isBirthdayCoffeeUsed
} from '../src/lib/membershipTier.js';
import {
  mergeDb,
  addCategoryStampToCustomer,
  redeemCategoryRewardForCustomer,
  applyTierDiscount,
  applyBirthdayCoffee
} from '../src/lib/db.js';

const customer = { id: 1, phone: '555', name: 'Test', birthDate: '2000-06-06' };

test('0 toplam LP Bronze seviyesi', () => {
  assert.equal(levelByLp(0), 'Bronze');
});

test('50 toplam LP Silver seviyesi', () => {
  assert.equal(levelByLp(49), 'Bronze');
  assert.equal(levelByLp(50), 'Silver');
});

test('150 toplam LP Gold seviyesi', () => {
  assert.equal(levelByLp(149), 'Silver');
  assert.equal(levelByLp(150), 'Gold');
});

test('300 toplam LP Black seviyesi', () => {
  assert.equal(levelByLp(299), 'Gold');
  assert.equal(levelByLp(300), 'Black');
});

test('ikram kullanınca mevcut LP düşer seviye düşmez', () => {
  const db = mergeDb({
    customers: [customer],
    loyalty: {
      1: {
        customerId: 1,
        schemaVersion: 2,
        lpBalance: 60,
        lpLifetime: 60,
        level: 'Silver',
        usedRewards: 0
      }
    },
    history: []
  });

  const next = redeemCategoryRewardForCustomer(db, 1, 'coffee', 'test');
  assert.equal(next.loyalty[1].lpBalance, 53);
  assert.equal(next.loyalty[1].lpLifetime, 60);
  assert.equal(next.loyalty[1].level, 'Silver');
});

test('Silver indirim %5 ayda bir kez', () => {
  const card = migrateLoyaltyCard({
    customerId: 1,
    schemaVersion: 2,
    lpBalance: 10,
    lpLifetime: 80,
    level: 'Silver'
  });
  assert.equal(getTierDiscountPercent('Silver'), 5);
  assert.equal(canUseMonthlyDiscount(card, 'Silver'), true);

  const db = mergeDb({
    customers: [customer],
    loyalty: { 1: card },
    history: []
  });

  const next = applyTierDiscount(db, 1, 'test');
  assert.equal(next.loyalty[1].monthlyDiscountMonth, currentMonthKey());
  assert.equal(next.history[0].type, 'tier_discount');
  assert.equal(next.history[0].count, 5);
  assert.equal(canUseMonthlyDiscount(next.loyalty[1], 'Silver'), false);
});

test('Gold indirim %10', () => {
  assert.equal(getTierDiscountPercent('Gold'), 10);
});

test('Black indirim %15', () => {
  assert.equal(getTierDiscountPercent('Black'), 15);
});

test('Bronze indirim hakkı yok', () => {
  assert.equal(getTierDiscountPercent('Bronze'), 0);
  const db = mergeDb({
    customers: [customer],
    loyalty: { 1: { customerId: 1, schemaVersion: 2, lpBalance: 5, lpLifetime: 5, level: 'Bronze' } },
    history: []
  });
  assert.equal(applyTierDiscount(db, 1), db);
});

test('doğum günü kahvesi tüm üyeler için avantaj metni', () => {
  const view = getMembershipView(
    { customerId: 1, schemaVersion: 2, lpBalance: 2, lpLifetime: 2, level: 'Bronze' },
    customer,
    []
  );
  assert.match(view.universalBenefits[0], /Doğum gününde 1 kahve ikramı/);
});

test('doğum günü kahvesi yılda bir kez', () => {
  const year = new Date().getFullYear();
  const db = mergeDb({
    customers: [{ ...customer, birthDate: `${year}-01-01` }],
    loyalty: { 1: { customerId: 1, schemaVersion: 2, lpBalance: 0, lpLifetime: 0, level: 'Bronze' } },
    history: [{ id: 1, customerId: 1, type: 'birthday_coffee', year }]
  });
  assert.equal(isBirthdayCoffeeUsed(db.history, 1, year), true);
});

test('getLevelProgress bir sonraki seviyeyi doğru hesaplar', () => {
  const track = getLevelProgress(82);
  assert.equal(track.level, 'Silver');
  assert.equal(track.nextLevel, 'Gold');
  assert.equal(track.remaining, 68);
});

test('LP kazanımında hem bakiye hem toplam artar', () => {
  const db = mergeDb({
    customers: [customer],
    loyalty: { 1: { customerId: 1, schemaVersion: 2, lpBalance: 0, lpLifetime: 0, level: 'Bronze' } },
    history: []
  });
  const next = addCategoryStampToCustomer(db, 1, 'coffee', 1, 'test');
  assert.equal(next.loyalty[1].lpBalance, 1);
  assert.equal(next.loyalty[1].lpLifetime, 1);
});

test('applyBirthdayCoffee doğum tarihi yoksa engeller', () => {
  const db = mergeDb({
    customers: [{ id: 2, phone: '556', name: 'NoBirth' }],
    loyalty: { 2: { customerId: 2, schemaVersion: 2, lpBalance: 0, lpLifetime: 0, level: 'Bronze' } },
    history: []
  });
  assert.equal(applyBirthdayCoffee(db, 2), db);
});
