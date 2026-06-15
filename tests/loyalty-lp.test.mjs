import assert from 'node:assert/strict';
import test from 'node:test';
import {
  convertLegacyToLp,
  migrateLoyaltyCard,
  migrateAllLoyalty,
  canRedeemLpReward,
  getCategoryLpGain
} from '../src/lib/loyaltyPoints.js';
import { mergeDb, addCategoryStampToCustomer } from '../src/lib/db.js';

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

test('kahve işlemi +1 LP ekler', () => {
  const db = mergeDb({
    customers: [{ id: 42, phone: '555', name: 'Test', email: 't@t.com' }],
    loyalty: { 42: { customerId: 42, schemaVersion: 2, lpBalance: 0, lpLifetime: 0, level: 'Bronze' } },
    history: []
  });

  const next = addCategoryStampToCustomer(db, 42, 'coffee', 1, 'test');
  assert.equal(next.loyalty[42].lpBalance, getCategoryLpGain('coffee'));
});

test('yetersiz LP ile ödül engellenir', () => {
  const card = migrateLoyaltyCard({ customerId: 1, categoryStamps: { coffee: 2, dessert: 0, burger: 0 } });
  assert.equal(canRedeemLpReward(card, 'coffee'), false);

  const lowBalance = migrateLoyaltyCard({ customerId: 7, schemaVersion: 2, lpBalance: 6, lpLifetime: 6 });
  assert.equal(canRedeemLpReward(lowBalance, 'coffee'), false);
  assert.equal(canRedeemLpReward({ ...lowBalance, lpBalance: 7 }, 'coffee'), true);
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
