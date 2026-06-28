import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { insertDailyClaim } from '../api/_lib/dailyClaimsStore.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// (customer_id, type, day) tekilliğini simüle eden basit mock sql tag
function createMockSql() {
  const seen = new Set();
  return async (strings, ...values) => {
    const query = strings.join('?');
    if (query.includes('INSERT INTO daily_claims')) {
      const [id, customerId, type, day] = values;
      const key = `${customerId}|${type}|${day}`;
      if (seen.has(key)) return []; // ON CONFLICT DO NOTHING
      seen.add(key);
      return [{ id }];
    }
    return [];
  };
}

test('aynı müşteri aynı gün iki kez claim alamaz', async () => {
  const sql = createMockSql();
  const claim = { id: 1, customerId: 10, type: 'daily_login', day: '2026-06-28', name: 'A', phone: '5', createdAt: 'x' };

  const first = await insertDailyClaim(sql, claim);
  const second = await insertDailyClaim(sql, { ...claim, id: 2 });

  assert.equal(first, true, 'ilk claim eklenmeli');
  assert.equal(second, false, 'ikinci claim çakışmalı (bugün zaten alındı)');
});

test('farklı müşteriler aynı gün claim yapabilir (global kilit yok)', async () => {
  const sql = createMockSql();
  const day = '2026-06-28';

  const a = await insertDailyClaim(sql, { id: 1, customerId: 10, type: 'daily_login', day, createdAt: 'x' });
  const b = await insertDailyClaim(sql, { id: 2, customerId: 20, type: 'daily_login', day, createdAt: 'x' });

  assert.equal(a, true);
  assert.equal(b, true);
});

test('günlük ödül global app_state FOR UPDATE kilidini kullanmaz', () => {
  const source = readFileSync(join(root, 'api/_lib/customerRewards.js'), 'utf8');
  // Eski global blob kilidi kalmamalı (app_state üzerinde FOR UPDATE'li SELECT)
  assert.doesNotMatch(source, /FROM app_state[^`]*FOR UPDATE/);
  // Müşteri bazlı kilit kullanılmalı
  assert.match(source, /SELECT id FROM customers WHERE id = \$\{id\} FOR UPDATE/);
  // Tablo bazlı idempotent claim
  assert.match(source, /insertDailyClaim/);
  assert.match(source, /loadDailyClaimsForCustomer/);
});

test('005 migration daily_claims tekillik indexi tanımlar', () => {
  const sql = readFileSync(join(root, 'scripts/sql/005_daily_claims_dedup.sql'), 'utf8');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS type/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS day/);
  assert.match(sql, /UNIQUE INDEX[\s\S]*daily_claims \(customer_id, type, day\)/);
  assert.match(sql, /ROLLBACK/);
});

test('relationalState dailyClaims\u0027i tablodan okur', () => {
  const source = readFileSync(join(root, 'api/_lib/relationalState.js'), 'utf8');
  assert.match(source, /loadAllDailyClaims/);
  assert.match(source, /loadDailyClaimsForCustomer/);
});
