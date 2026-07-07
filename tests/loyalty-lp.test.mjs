import assert from 'node:assert/strict';
import test from 'node:test';
import {
  convertLegacyToLp,
  migrateLoyaltyCard,
  migrateAllLoyalty,
  canRedeemLpReward,
  getCategoryLpGain,
  getCategoryRewardCost,
  lpRewardStatusText
} from '../src/lib/loyaltyPoints.js';
import { mergeDb, addCategoryStampToCustomer, redeemCategoryRewardForCustomer } from '../src/lib/db.js';

test('eski damgalar LP\'ye dönüştürülür', () => {
  const lp = convertLegacyToLp(
    { coffee: 3, dessert: 2, burger: 1 },
    { coffee: 1, dessert: 0, burger: 0 }
  );
  assert.equal(lp, 3 * 1 + 2 * 2 + 1 * 3 + 7);
});

test('migration eski alanları korur', () => {
  const migrated = migrateLoyaltyCard({
    customerId: 1,
    categoryStamps: { coffee: 4, dessert: 0, burger: 0 },
    categoryRewards: { coffee: 0, dessert: 0, burger: 0 },
    lifetimeStamps: 4
  });

  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.lpBalance, 4);
  assert.equal(migrated._legacy.categoryStamps.coffee, 4);
});

test('tatlı işlemi +2 LP ekler', () => {
  const db = mergeDb({
    customers: [{ id: 43, phone: '556', name: 'Test', email: 't@t.com' }],
    loyalty: { 43: { customerId: 43, schemaVersion: 2, lpBalance: 0, lpLifetime: 0, level: 'Bronze' } },
    history: []
  });

  const next = addCategoryStampToCustomer(db, 43, 'dessert', 1, 'test');
  assert.equal(next.loyalty[43].lpBalance, getCategoryLpGain('dessert'));
  assert.equal(next.history[0].type, 'earn_dessert');
});

test('tatlı ikram -15 LP düşer', () => {
  const db = mergeDb({
    customers: [{ id: 10, phone: '557', name: 'Test', email: 't@t.com' }],
    loyalty: { 10: { customerId: 10, schemaVersion: 2, lpBalance: 15, lpLifetime: 15, level: 'Bronze', usedRewards: 0 } },
    history: []
  });
  const next = redeemCategoryRewardForCustomer(db, 10, 'dessert', 'test');
  assert.equal(next.loyalty[10].lpBalance, 0);
  assert.equal(next.history[0].type, 'redeem_dessert');
  assert.equal(next.history[0].count, 15);
});

test('LP bakiyesi eksiye düşmez', () => {
  const db = mergeDb({
    customers: [{ id: 11, phone: '558', name: 'Test', email: 't@t.com' }],
    loyalty: { 11: { customerId: 11, schemaVersion: 2, lpBalance: 0, lpLifetime: 0, level: 'Bronze' } },
    history: []
  });
  const next = addCategoryStampToCustomer(db, 11, 'coffee', -1, 'test');
  assert.equal(next, db);
  assert.equal(next.loyalty[11].lpBalance, 0);
});

test('kahve işlemi +1 LP ekler', () => {
  const db = mergeDb({
    customers: [{ id: 42, phone: '555', name: 'Test', email: 't@t.com' }],
    loyalty: { 42: { customerId: 42, schemaVersion: 2, lpBalance: 0, lpLifetime: 0, level: 'Bronze' } },
    history: []
  });

  const next = addCategoryStampToCustomer(db, 42, 'coffee', 1, 'test');
  assert.equal(next.loyalty[42].lpBalance, getCategoryLpGain('coffee'));
  assert.equal(next.history[0].type, 'earn_coffee');
});

test('yetersiz LP ile ödül engellenir', () => {
  const card = migrateLoyaltyCard({ customerId: 1, categoryStamps: { coffee: 2, dessert: 0, burger: 0 } });
  assert.equal(canRedeemLpReward(card, 'coffee'), false);

  const lowBalance = migrateLoyaltyCard({ customerId: 7, schemaVersion: 2, lpBalance: 6, lpLifetime: 6 });
  assert.equal(canRedeemLpReward(lowBalance, 'coffee'), false);
  assert.equal(canRedeemLpReward({ ...lowBalance, lpBalance: 7 }, 'coffee'), true);
});

test('sandviç işlemi +2 LP ekler', () => {
  const db = mergeDb({
    customers: [{ id: 44, phone: '559', name: 'Test', email: 't@t.com' }],
    loyalty: { 44: { customerId: 44, schemaVersion: 2, lpBalance: 0, lpLifetime: 0, level: 'Bronze' } },
    history: []
  });

  const next = addCategoryStampToCustomer(db, 44, 'sandwich', 1, 'test');
  assert.equal(next.loyalty[44].lpBalance, getCategoryLpGain('sandwich'));
  assert.equal(next.history[0].type, 'earn_sandwich');
});

test('sandviç ikram -18 LP düşer', () => {
  const db = mergeDb({
    customers: [{ id: 12, phone: '560', name: 'Test', email: 't@t.com' }],
    loyalty: { 12: { customerId: 12, schemaVersion: 2, lpBalance: 18, lpLifetime: 18, level: 'Bronze', usedRewards: 0 } },
    history: []
  });
  const next = redeemCategoryRewardForCustomer(db, 12, 'sandwich', 'test');
  assert.equal(next.loyalty[12].lpBalance, 0);
  assert.equal(next.history[0].type, 'redeem_sandwich');
  assert.equal(next.history[0].count, 18);
});

test('sandviç ikram 18 LP gerektirir', () => {
  assert.equal(getCategoryRewardCost('sandwich'), 18);
  assert.equal(getCategoryLpGain('sandwich'), 2);
  const card = migrateLoyaltyCard({ customerId: 1, schemaVersion: 2, lpBalance: 17, lpLifetime: 17 });
  assert.equal(canRedeemLpReward(card, 'sandwich'), false);
  assert.equal(canRedeemLpReward({ ...card, lpBalance: 18 }, 'sandwich'), true);
});

test('Patates Tabağı burger LP eklemez', () => {
  const db = mergeDb({
    customers: [{ id: 20, phone: '561', name: 'Test', email: 't@t.com' }],
    loyalty: { 20: { customerId: 20, schemaVersion: 2, lpBalance: 0, lpLifetime: 0, level: 'Bronze' } },
    history: []
  });
  const patates = { id: 68, categoryId: 6, name: 'Patates Tabağı' };
  const blocked = addCategoryStampToCustomer(db, 20, 'burger', 1, 'test', patates);
  assert.equal(blocked, db);
  assert.equal(blocked.loyalty[20].lpBalance, 0);

  const smash = { id: 69, categoryId: 6, name: 'Smash Burger' };
  const next = addCategoryStampToCustomer(db, 20, 'burger', 1, 'test', smash);
  assert.equal(next.loyalty[20].lpBalance, 3);
});

test('burger LP ürün seçmeden doğrudan +3 eklenir', () => {
  const db = mergeDb({
    customers: [{ id: 21, phone: '562', name: 'Test', email: 't@t.com' }],
    loyalty: { 21: { customerId: 21, schemaVersion: 2, lpBalance: 0, lpLifetime: 0, level: 'Bronze' } },
    history: []
  });
  const next = addCategoryStampToCustomer(db, 21, 'burger', 1, 'test');
  assert.equal(next.loyalty[21].lpBalance, 3);
});

test('burger ikram 25 LP gerektirir', () => {
  assert.equal(getCategoryRewardCost('burger'), 25);
  const card = migrateLoyaltyCard({ customerId: 1, schemaVersion: 2, lpBalance: 24, lpLifetime: 24 });
  assert.equal(canRedeemLpReward(card, 'burger'), false);
  assert.equal(canRedeemLpReward({ ...card, lpBalance: 25 }, 'burger'), true);
  assert.match(lpRewardStatusText({ ...card, lpBalance: 22 }, { id: 'burger', redeemTitle: 'Burger İkram' }), /3 LP kaldı/);
});

test('kahve ikram -7 LP düşer', () => {
  const db = mergeDb({
    customers: [{ id: 9, phone: '555', name: 'Test', email: 't@t.com' }],
    loyalty: { 9: { customerId: 9, schemaVersion: 2, lpBalance: 7, lpLifetime: 7, level: 'Bronze', usedRewards: 0 } },
    history: []
  });
  const next = redeemCategoryRewardForCustomer(db, 9, 'coffee', 'test');
  assert.equal(next.loyalty[9].lpBalance, 0);
  assert.equal(next.history[0].type, 'redeem_coffee');
  assert.equal(next.history[0].count, 7);
});

test('mergeDb tüm loyalty kayıtlarını migrate eder', () => {
  const db = mergeDb({
    loyalty: {
      1: { customerId: 1, categoryStamps: { coffee: 7, dessert: 0, burger: 0 } }
    }
  });

  assert.equal(db.loyalty[1].schemaVersion, 2);
  assert.equal(db.loyalty[1].lpBalance, 7);
});

test('migrateAllLoyalty çoklu kayıt', () => {
  const out = migrateAllLoyalty({
    a: { categoryStamps: { coffee: 1, dessert: 0, burger: 0 } },
    b: { categoryStamps: { coffee: 0, dessert: 1, burger: 0 } }
  });
  assert.equal(out.a.lpBalance, 1);
  assert.equal(out.b.lpBalance, 2);
});
