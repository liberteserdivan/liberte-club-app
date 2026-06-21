import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyAdminMemberSlice,
  dedupeCustomersByPhone,
  finalizeAdminMemberCustomers,
  isLocalSeedCustomer,
  mergeAdminRemoteIntoDb,
  mergeCustomerRecordsById,
  pickAdminMemberList,
  resolveAdminCustomers
} from '../src/lib/adminMemberSync.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const fullCustomers = [
  { id: 1, name: 'Admin', phone: '5058665406', isAdmin: true },
  { id: 2, name: 'Uye A', phone: '5550100001', isAdmin: false },
  { id: 3, name: 'Uye B', phone: '5550100002', isAdmin: false }
];

test('mergeCustomerRecordsById kayıtları id ile birleştirir', () => {
  const merged = mergeCustomerRecordsById(
    [{ id: 1, name: 'Eski' }],
    [{ id: 1, name: 'Yeni' }, { id: 2, name: 'Uye' }]
  );
  assert.equal(merged.length, 2);
  assert.equal(merged[0].name, 'Yeni');
});

test('applyAdminMemberSlice tam üye listesini uygular', () => {
  const db = { customers: [fullCustomers[0]], loyalty: { 1: { lpBalance: 1 } } };
  const next = applyAdminMemberSlice(db, {
    customers: fullCustomers,
    loyalty: { 2: { lpBalance: 5 }, 3: { lpBalance: 8 } }
  });
  assert.equal(next.customers.length, 3);
  assert.equal(next.loyalty[2].lpBalance, 5);
});

test('applyAdminMemberSlice kısmi listeyi tam listeyi ezmekten korur', () => {
  const full = [
    { id: 1, name: 'Admin', phone: '5058665406' },
    { id: 2, name: 'Uye', phone: '5550100001' }
  ];
  const db = { customers: full, loyalty: {} };
  const next = applyAdminMemberSlice(db, { customers: [full[0]], loyalty: {} });
  assert.equal(next.customers.length, 2);
});

test('resolveAdminCustomers mevcut listeyi korur', () => {
  const resolved = resolveAdminCustomers({ customers: fullCustomers }, [fullCustomers[0]]);
  assert.equal(resolved.length, 3);
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

test('dedupeCustomersByPhone aynı telefondaki seed admin ile relational admini birleştirir', () => {
  const deduped = dedupeCustomersByPhone([
    { id: 1, name: 'Liberte Gastro', phone: '5058665406', isAdmin: true },
    { id: 1781890013602, name: 'Liberte Cafe', phone: '5058665406', isAdmin: true }
  ]);
  assert.equal(deduped.length, 1);
  assert.equal(String(deduped[0].id), '1781890013602');
});

test('finalizeAdminMemberCustomers demo seed kayıtlarını dışlar', () => {
  const list = finalizeAdminMemberCustomers([
    { id: 900001, name: 'Demo Müşteri', phone: '5550100001', email: 'demo.customer@liberte.cafe' },
    { id: 900002, name: 'Demo Yönetici', phone: '5550100002', email: 'demo.admin@liberte.cafe', isAdmin: true },
    { id: 1781950441001, name: 'Kadir Kartal', phone: '5388588154', email: 'kadir@test.com' }
  ]);
  assert.equal(list.length, 1);
  assert.equal(String(list[0].id), '1781950441001');
});

test('pickAdminMemberList sunucu listesinde snapshot seed karışmaz', () => {
  const picked = pickAdminMemberList({
    adminMembers: [
      { id: 1781890013602, name: 'Liberte Cafe', phone: '5058665406', isAdmin: true },
      { id: 1781950441001, name: 'Kadir Kartal', phone: '5388588154', isAdmin: false }
    ],
    adminMembersStatus: 'ready',
    db: {
      customers: [
        { id: 1, name: 'Liberte Gastro', phone: '5058665406', isAdmin: true },
        { id: 900001, name: 'Demo Müşteri', phone: '5550100001', email: 'demo.customer@liberte.cafe' }
      ]
    }
  });
  assert.equal(picked.length, 2);
  assert.ok(!picked.some((row) => isLocalSeedCustomer(row)));
});

test('pickAdminMemberList snapshot ile tek kayda düşmez', () => {
  const picked = pickAdminMemberList({
    adminMembers: [fullCustomers[0]],
    adminMembersStatus: 'error',
    db: { customers: [fullCustomers[0]] }
  });
  assert.equal(picked.length, 1);
});

test('admin members endpoint kayıtlı', () => {
  const admin = readFileSync(join(root, 'api', 'admin.js'), 'utf8');
  const vercel = readFileSync(join(root, 'vercel.json'), 'utf8');
  assert.match(admin, /members:\s*\(\)\s*=>\s*import\('\.\/_lib\/handlers\/adminMembers\.js'\)/);
  assert.match(vercel, /\/api\/admin\/members/);
});

test('mergeAdminRemoteIntoDb müşteri oturumunda kısıtlama yapmaz', () => {
  const partialRemote = { customers: [fullCustomers[0]] };
  const merged = mergeAdminRemoteIntoDb({ customers: fullCustomers }, partialRemote, {
    isAdmin: false,
    adminVerified: false
  });
  assert.equal(merged.customers.length, 1);
});
