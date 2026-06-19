import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeAuthSnapshot } from '../src/lib/db.js';

test('mergeAuthSnapshot yeni müşteriyi yerel db ye ekler', () => {
  const base = { customers: [], loyalty: {} };
  const next = mergeAuthSnapshot(base, {
    customer: {
      id: 42,
      name: 'Test',
      phone: '5551112233',
      email: 't@test.com',
      isAdmin: false
    },
    loyalty: {
      customerId: 42,
      lpBalance: 4,
      lpLifetime: 4,
      level: 'Bronze'
    }
  });

  assert.equal(next.customers.length, 1);
  assert.equal(next.customers[0].name, 'Test');
  assert.equal(next.loyalty[42].lpBalance, 4);
});
