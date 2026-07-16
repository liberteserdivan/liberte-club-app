import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureDailyClaimsSchema, resetDailyClaimsSchemaCache } from '../api/_lib/dailyClaimsStore.js';

// RB-8: Uretimde daily_claims DDL'i (ALTER/CREATE INDEX) calismamali.
// Pooler'da CREATE UNIQUE INDEX kilit/donma yaratabilir; uretimde sema 008 ile
// elle uygulanir. Diger store'larla (schemaReady) tutarli davranis.

test('ensureDailyClaimsSchema production ortaminda SQL calistirmaz', async () => {
  const prev = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'production';
  resetDailyClaimsSchemaCache();

  let called = false;
  // sql tagged-template cagrilirsa called=true olur
  const fakeSql = new Proxy(() => {
    called = true;
    return Promise.resolve([]);
  }, { apply: () => { called = true; return Promise.resolve([]); } });

  await ensureDailyClaimsSchema(fakeSql);
  assert.equal(called, false, 'uretimde DDL calismamali');

  process.env.VERCEL_ENV = prev;
  resetDailyClaimsSchemaCache();
});

test('ensureDailyClaimsSchema production disinda DDL calistirir', async () => {
  const prev = process.env.VERCEL_ENV;
  const prevNode = process.env.NODE_ENV;
  process.env.VERCEL_ENV = 'development';
  process.env.NODE_ENV = 'development';
  resetDailyClaimsSchemaCache();

  let calls = 0;
  const fakeSql = new Proxy(() => {
    calls += 1;
    return Promise.resolve([]);
  }, { apply: () => { calls += 1; return Promise.resolve([]); } });

  await ensureDailyClaimsSchema(fakeSql);
  assert.ok(calls > 0, 'gelistirme ortaminda ALTER/INDEX calismali');

  process.env.VERCEL_ENV = prev;
  process.env.NODE_ENV = prevNode;
  resetDailyClaimsSchemaCache();
});
