import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('Admin members polling arka planda/gizliyken durur', () => {
  const source = readFileSync(join(root, 'src/hooks/useAdminMembers.js'), 'utf8');
  assert.match(source, /usePageActive/);
  assert.match(source, /if \(!active\) return undefined;/);
  assert.match(source, /\[enabled, active, commit, pullMembers/);
});

test('Admin dashboard stats polling arka planda/gizliyken durur', () => {
  const source = readFileSync(join(root, 'src/hooks/useAdminDashboardStats.js'), 'utf8');
  assert.match(source, /usePageActive/);
  assert.match(source, /if \(!active\) return undefined;/);
  assert.match(source, /\[enabled, active, refreshStats\]/);
});

test('QR/kasa sekmesi artık 5 saniyede bir poll yapmaz', () => {
  const source = readFileSync(join(root, 'src/lib/syncPolicy.js'), 'utf8');
  assert.match(source, /SYNC_INTERVAL_FAST_MS = 15_000/);
  assert.doesNotMatch(source, /SYNC_INTERVAL_FAST_MS = 5_000/);
});

test('Tam state pull sonrası duplicate admin members fetch yok (tek kanal)', () => {
  const source = readFileSync(join(root, 'src/hooks/useCommit.js'), 'utf8');
  // useCommit artık doğrudan members çekmemeli (useAdminMembers tek kanal)
  assert.doesNotMatch(source, /fetchAdminMembersList/);
  assert.doesNotMatch(source, /fetchAdminCustomers/);
});

test('useCommit native arka planda interval kurmaz', () => {
  const source = readFileSync(join(root, 'src/hooks/useCommit.js'), 'utf8');
  assert.match(source, /isNativeAppActive/);
  assert.match(source, /subscribeActiveChange/);
});

test('Realtime hook\u0027lar\u0131 db ba\u011f\u0131ml\u0131l\u0131\u011f\u0131yla yeniden abone olmaz (hedefli refresh)', () => {
  const customer = readFileSync(join(root, 'src/hooks/useCustomerRealtime.js'), 'utf8');
  const admin = readFileSync(join(root, 'src/hooks/useAdminRealtime.js'), 'utf8');
  // Abonelik effect deps'inde db yok; dbRef kullanılıyor
  assert.match(customer, /\}, \[enabled, customerId, commit\]\);/);
  assert.match(admin, /\}, \[enabled, commit, onFeedUpdate, onCustomersChanged\]\);/);
});
