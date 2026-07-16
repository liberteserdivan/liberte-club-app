import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LP_GAIN,
  LP_COSTS,
  levelByLp,
  applyLpEarn,
  applyLpRedeem
} from '../api/_lib/loyalty.js';

test('levelByLp thresholds', () => {
  assert.equal(levelByLp(0), 'Bronze');
  assert.equal(levelByLp(49), 'Bronze');
  assert.equal(levelByLp(50), 'Silver');
  assert.equal(levelByLp(149), 'Silver');
  assert.equal(levelByLp(150), 'Gold');
  assert.equal(levelByLp(299), 'Gold');
  assert.equal(levelByLp(300), 'Black');
});

test('LP gain/cost constants', () => {
  assert.equal(LP_GAIN.coffee, 1);
  assert.equal(LP_GAIN.dessert, 2);
  assert.equal(LP_GAIN.sandwich, 2);
  assert.equal(LP_GAIN.burger, 3);
  assert.equal(LP_COSTS.coffee, 7);
  assert.equal(LP_COSTS.dessert, 15);
  assert.equal(LP_COSTS.sandwich, 18);
  assert.equal(LP_COSTS.burger, 25);
});

test('applyLpEarn and redeem', () => {
  const base = { customerId: 1, lpBalance: 10, lpLifetime: 10, level: 'Bronze' };
  const earned = applyLpEarn(base, 'burger', 2);
  assert.equal(earned.ok, true);
  assert.equal(earned.delta, 6);
  assert.equal(earned.card.lpBalance, 16);
  assert.equal(earned.card.lpLifetime, 16);

  const redeemed = applyLpRedeem(earned.card, 'coffee', 1);
  assert.equal(redeemed.ok, true);
  assert.equal(redeemed.delta, -7);
  assert.equal(redeemed.card.lpBalance, 9);
  assert.equal(redeemed.card.lpLifetime, 16);

  const fail = applyLpRedeem({ lpBalance: 3, lpLifetime: 3 }, 'coffee', 1);
  assert.equal(fail.ok, false);
});
