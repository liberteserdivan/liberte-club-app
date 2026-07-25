import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('günlük giriş ödülü API kapalı', () => {
  const loyalty = readFileSync(join(root, 'api', 'loyalty.js'), 'utf8');
  const handler = readFileSync(join(root, 'api', '_lib', 'handlers', 'customerLoyaltyClaim.js'), 'utf8');

  assert.match(loyalty, /daily-claim/);
  assert.match(handler, /DAILY_CLAIM_DISABLED/);
  assert.doesNotMatch(handler, /applyDailyLoginRewardRelational/);
});

test('ana sayfada günlük görevler şeridi yok', () => {
  const home = readFileSync(join(root, 'src', 'pages', 'HomePage.jsx'), 'utf8');
  assert.doesNotMatch(home, /DailyTasksStrip/);
  assert.doesNotMatch(home, /Günlük görev/);
  assert.equal(existsSync(join(root, 'src', 'components', 'DailyTasksStrip.jsx')), false);
});

test('vercel loyalty rewrite tanımlı', () => {
  const vercel = readFileSync(join(root, 'vercel.json'), 'utf8');
  assert.match(vercel, /\/api\/loyalty\/daily-claim/);
});
