import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { purgeExpiredAuthData } from '../api/_lib/maintenance.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('purgeExpiredAuthData LIMIT batch ve sayac doner', async () => {
  const src = readFileSync(join(root, 'api/_lib/maintenance.js'), 'utf8');
  assert.match(src, /LIMIT/);
  assert.match(src, /PURGE_BATCH/);
  const result = await purgeExpiredAuthData(null);
  assert.deepEqual(result, { sessions: 0, rateLimits: 0, qrNonces: 0 });
});

test('guardian cron purgeExpiredAuthData cagirir', () => {
  const src = readFileSync(join(root, 'api/_lib/handlers/guardian.js'), 'utf8');
  assert.match(src, /purgeExpiredAuthData/);
  assert.match(src, /runCronAuthPurge/);
  assert.match(src, /CRON_SECRET_MISSING/);
});

test('CRON_SECRET yokken fail-closed alarm logu', () => {
  const src = readFileSync(join(root, 'api/_lib/handlers/guardian.js'), 'utf8');
  const fn = src.slice(src.indexOf('function isAuthorizedCron'));
  assert.match(fn.slice(0, 500), /CRON_SECRET_MISSING/);
  assert.match(fn.slice(0, 500), /return false/);
});
