import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyBirthdayCoffee } from '../api/_lib/loyaltyOps.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Bugunun ay/gun degerinden bir dogum tarihi uret (dogum gunu kontrolu icin)
function todayBirthDate() {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `2000-${mm}-${dd}`;
}

function baseState(history) {
  return {
    customers: [{ id: 1, name: 'Test', phone: '5550000000', birthDate: todayBirthDate() }],
    loyalty: { 1: { customerId: 1, schemaVersion: 2, lpBalance: 0, lpLifetime: 0 } },
    history: history || []
  };
}

test('applyBirthdayCoffee: gecmis bos ise dogum gununde ikram verir', () => {
  const result = applyBirthdayCoffee(baseState([]), 1);
  assert.equal(result.ok, true);
});

test('applyBirthdayCoffee: ayni yil zaten alinmissa reddeder (dedup)', () => {
  const year = new Date().getFullYear();
  const history = [{ customerId: 1, type: 'birthday_coffee', year }];
  const result = applyBirthdayCoffee(baseState(history), 1);
  assert.equal(result.ok, false);
  assert.match(result.error, /bu yıl zaten/i);
});

// RB-7 kablolama: relational akis dogum gunu isleminde gecmis dogum gunu
// olaylarini DB'den yuklemeli (miniState.history bos kalmamali).
test('applyLoyaltyActionRelational dogum gunu icin gecmis yukler', () => {
  const src = readFileSync(join(root, 'api/_lib/loyaltyStore.js'), 'utf8');
  assert.match(src, /export async function loadBirthdayHistory/);
  assert.match(src, /if \(action === 'birthday_coffee'\) \{\s*miniState\.history = await loadBirthdayHistory\(tx, id\)/);
});
