import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureSchemaReady, resetSchemaReadyCache } from '../api/_lib/schemaReady.js';

test('ensureSchemaReady production ortamında SQL çalıştırmaz', async () => {
  const prev = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'production';
  resetSchemaReadyCache();

  let called = false;
  const fakeSql = new Proxy(() => {
    called = true;
    return Promise.resolve([]);
  }, { apply: () => { called = true; return Promise.resolve([]); } });

  await ensureSchemaReady(fakeSql);
  assert.equal(called, false);

  process.env.VERCEL_ENV = prev;
  resetSchemaReadyCache();
});
