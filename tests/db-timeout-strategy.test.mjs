import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withSqlRetry } from '../api/_lib/dbTransient.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('READ: bayat/asılı bağlantı attemptTimeoutMs ile sınırlı denemede fail/retry yapar', async () => {
  let attempts = 0;
  // Asla çözülmeyen görev — bayat bağlantıyı simüle eder
  const hung = () => {
    attempts += 1;
    return new Promise(() => {});
  };

  await assert.rejects(
    withSqlRetry(hung, { retries: 2, attemptTimeoutMs: 50 }),
    /ETIMEDOUT/
  );
  // Her deneme attemptTimeoutMs ile kesilir; toplam deneme = retries + 1
  assert.equal(attempts, 3);
});

test('WRITE: attemptTimeoutMs yokken görev tek kez çalışır (çift mutasyon yok)', async () => {
  let runs = 0;
  const slowWrite = async () => {
    runs += 1;
    await delay(40);
    return 'ok';
  };

  const result = await withSqlRetry(slowWrite, { retries: 2 });
  assert.equal(result, 'ok');
  // Yarış/iptal olmadığı için görev sadece bir kez çalışmalı
  assert.equal(runs, 1);
});

test('runSqlRead read için attemptTimeout, runSql (write) için yok', () => {
  const source = readFileSync(join(root, 'api/_lib/runSql.js'), 'utf8');
  assert.match(source, /export function runSqlRead/);
  assert.match(source, /attemptTimeoutMs: READ_ATTEMPT_TIMEOUT_MS/);
  assert.match(source, /READ_ATTEMPT_TIMEOUT_MS = 6000/);

  // runSql (write) bloğunda attemptTimeoutMs olmamalı
  const runSqlBlock = source.slice(
    source.indexOf('export function runSql('),
    source.indexOf('export function runSqlRead')
  );
  assert.doesNotMatch(runSqlBlock, /attemptTimeoutMs:/);
});

test('state.js read uçları runSqlRead, write (saveAppState) runSql kullanır', () => {
  const source = readFileSync(join(root, 'api/state.js'), 'utf8');
  assert.match(source, /runSqlRead\(\(\) => loadAppStateRevision\(\)\)/);
  assert.match(source, /runSqlRead\(\(\) => \(\s*isFullAdmin/);
  // Yazma hâlâ runSql (idempotent olmayan tam state yazımı yarışmaya sokulmaz)
  assert.match(source, /runSql\(\(\) => saveAppState/);
});

test('Yazma transactionları statement_timeout ile sınırlı', () => {
  const loyalty = readFileSync(join(root, 'api/_lib/loyaltyStore.js'), 'utf8');
  const rewards = readFileSync(join(root, 'api/_lib/customerRewards.js'), 'utf8');
  assert.match(loyalty, /SET LOCAL statement_timeout/);
  assert.match(rewards, /SET LOCAL statement_timeout/);
});
