import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Basit localStorage mock'u (db.js global localStorage kullanır)
function installMockStorage(initial = {}) {
  const store = { ...initial };
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  };
  return store;
}

test('clearLocalDb liberteDB\u0027yi siler, son telefon/e-posta korunur', async () => {
  const store = installMockStorage({
    liberteDB: JSON.stringify({ customers: [{ id: 1, phone: '555' }], loyalty: { 1: {} }, history: [{ id: 9 }] }),
    liberteLastPhone: '5551112233',
    liberteLastEmail: 'a@b.com',
    liberteDeviceId: 'dev-1'
  });

  const { clearLocalDb } = await import('../src/lib/db.js');
  clearLocalDb();

  assert.equal(store.liberteDB, undefined, 'liberteDB (PII) silinmeli');
  assert.equal(store.liberteLastPhone, '5551112233', 'son telefon korunmalı');
  assert.equal(store.liberteLastEmail, 'a@b.com', 'son e-posta korunmalı');
  assert.equal(store.liberteDeviceId, 'dev-1', 'deviceId korunmalı');
});

test('Açılışta şişmiş/bozuk localStorage uygulamayı kilitlemez (seed döner)', async () => {
  const huge = 'x'.repeat(2_000_001);
  const store = installMockStorage({ liberteDB: huge });

  const { load } = await import('../src/lib/db.js');
  const result = load();

  assert.ok(result && typeof result === 'object', 'load bir state döndürmeli');
  assert.equal(store.liberteDB, undefined, 'şişmiş önbellek atılmalı');
});

test('logoutSession yerel veri önbelleğini (PII) temizler', () => {
  const source = readFileSync(join(root, 'src/lib/session.js'), 'utf8');
  assert.match(source, /import \{ clearLocalDb \} from '\.\/db\.js'/);
  const fn = source.slice(source.indexOf('export function logoutSession'));
  assert.match(fn.slice(0, fn.indexOf('}')), /clearLocalDb\(\)/);
});
