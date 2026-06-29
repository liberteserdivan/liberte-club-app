import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

// RB-4: Baglanti baslina global statement_timeout (donma korumasi)
test('RB-4: sql.js baglanti secenekleri statement_timeout iceriyor', () => {
  const src = read('api/_lib/sql.js');
  assert.match(src, /STATEMENT_TIMEOUT_MS\s*=\s*\d+/);
  assert.match(src, /statement_timeout:\s*STATEMENT_TIMEOUT_MS/);
});

// RB-3: Admin tam-state yazimi toplu upsert + tek transaction + statement_timeout
test('RB-3: persistStateToRelational toplu upsert ve transaction kullanir', () => {
  const src = read('api/_lib/relationalState.js');
  assert.match(src, /sql\.begin\(async \(tx\) => \{/);
  assert.match(src, /SET LOCAL statement_timeout/);
  assert.match(src, /upsertCustomerRowsBulk\(tx, customers\)/);
  assert.match(src, /upsertLoyaltyRowsBulk\(tx, loyaltyEntries\)/);
  assert.match(src, /upsertCustomerEmailRowsBulk\(tx, customers\)/);
  // Eski N+1 dongusu kalmamali
  assert.doesNotMatch(src, /for \(const customer of state\.customers/);
});

test('RB-3: toplu upsert fonksiyonlari customersStore icinde tanimli', () => {
  const src = read('api/_lib/customersStore.js');
  assert.match(src, /export async function upsertCustomerRowsBulk/);
  assert.match(src, /export async function upsertLoyaltyRowsBulk/);
  // Tekil upsert ile ayni cakisma davranisi (revision artisi korunur)
  assert.match(src, /revision = customer_loyalty\.revision \+ 1/);
});

// RB-5: register cifte-yazma korumasi (bumpAppStateRevision best-effort)
test('RB-5: register bumpAppStateRevision try/catch ile sarili', () => {
  const src = read('api/_lib/handlers/authRegisterComplete.js');
  assert.match(src, /try \{\s*await bumpAppStateRevision\(sql\);\s*\} catch/);
});
