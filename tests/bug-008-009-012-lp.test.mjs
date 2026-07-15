import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

test('BUG-008: admin member loyalty Idempotency-Key kullanir', () => {
  const handler = read('api/_lib/handlers/adminMemberLoyalty.js');
  assert.match(handler, /idempotency-key/i);
  assert.match(handler, /IDEMPOTENCY_REPLAY/);
  const client = read('src/lib/adminMemberClient.js');
  assert.match(client, /Idempotency-Key/);
});

test('BUG-009: legacy adminLoyalty yolu relational zorunlu', () => {
  const src = read('api/_lib/handlers/adminLoyalty.js');
  assert.match(src, /RELATIONAL_REQUIRED/);
  assert.doesNotMatch(src, /saveAppStateIfUnchanged/);
  assert.doesNotMatch(src, /claimQrNonce\(getSql/);
});

test('BUG-012: streak Istanbul gun anahtari', () => {
  const src = read('api/_lib/customerRewards.js');
  assert.match(src, /previousIstanbulDayKey/);
  assert.match(src, /Europe\/Istanbul/);
  assert.doesNotMatch(src, /cursor\.getFullYear/);
  assert.doesNotMatch(src, /cursor\.getDate\(\)/);
});
