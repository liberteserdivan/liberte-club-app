import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('günlük LP ödülü sunucu API ile kaydedilir', () => {
  const loyalty = readFileSync(join(root, 'api', 'loyalty.js'), 'utf8');
  const handler = readFileSync(join(root, 'api', '_lib', 'handlers', 'customerLoyaltyClaim.js'), 'utf8');
  const client = readFileSync(join(root, 'src', 'lib', 'customerRewardsClient.js'), 'utf8');
  const strip = readFileSync(join(root, 'src', 'components', 'DailyTasksStrip.jsx'), 'utf8');

  assert.match(loyalty, /daily-claim/);
  assert.match(handler, /applyDailyLoginRewardRelational/);
  assert.match(client, /\/api\/loyalty\/daily-claim/);
  assert.match(strip, /claimDailyLoginRewardRemote/);
  assert.match(strip, /skipRemote: true/);
});

test('vercel loyalty rewrite tanımlı', () => {
  const vercel = readFileSync(join(root, 'vercel.json'), 'utf8');
  assert.match(vercel, /\/api\/loyalty\/daily-claim/);
});
