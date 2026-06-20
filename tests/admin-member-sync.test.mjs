import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAdminMemberSlice, mergeAdminRemoteIntoDb } from '../src/lib/adminMemberSync.js';

const fullCustomers = [
  { id: 1, name: 'Admin', phone: '5058665406', isAdmin: true },
  { id: 2, name: 'Uye A', phone: '5550100001', isAdmin: false },
  { id: 3, name: 'Uye B', phone: '5550100002', isAdmin: false }
];

test('applyAdminMemberSlice tam üye listesini uygular', () => {
  const db = { customers: [fullCustomers[0]], loyalty: { 1: { lpBalance: 1 } } };
  const next = applyAdminMemberSlice(db, {
    customers: fullCustomers,
    loyalty: { 2: { lpBalance: 5 }, 3: { lpBalance: 8 } }
  });
  assert.equal(next.customers.length, 3);
  assert.equal(next.loyalty[2].lpBalance, 5);
});

test('mergeAdminRemoteIntoDb kısmi state ile tam listeyi ezmez', () => {
  const current = {
    customers: fullCustomers,
    loyalty: { 1: { lpBalance: 1 }, 2: { lpBalance: 2 } }
  };
  const partialRemote = {
    customers: [fullCustomers[0]],
    loyalty: { 1: { lpBalance: 99 } },
    settings: { cafe_name: 'Liberte' }
  };
  const session = { isAdmin: true, adminVerified: true };
  const merged = mergeAdminRemoteIntoDb(current, partialRemote, session);
  assert.equal(merged.customers.length, 3);
  assert.equal(merged.settings.cafe_name, 'Liberte');
});

test('mergeAdminRemoteIntoDb müşteri oturumunda kısıtlama yapmaz', () => {
  const partialRemote = { customers: [fullCustomers[0]] };
  const merged = mergeAdminRemoteIntoDb({ customers: fullCustomers }, partialRemote, {
    isAdmin: false,
    adminVerified: false
  });
  assert.equal(merged.customers.length, 1);
});
