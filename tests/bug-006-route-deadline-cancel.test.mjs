import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('forceResetSqlClient export ve soft reset ayrimi', async () => {
  const sql = await import('../api/_lib/sql.js');
  assert.equal(typeof sql.forceResetSqlClient, 'function');
  assert.equal(typeof sql.resetSqlClient, 'function');
});

test('routeDeadline: forceResetSqlClient bagimli; onDeadline enjekte edilebilir', () => {
  const source = readFileSync(join(root, 'api/_lib/routeDeadline.js'), 'utf8');
  assert.match(source, /forceResetSqlClient/);
  assert.match(source, /onDeadline/);
  assert.match(source, /releaseOnDeadline/);
});

test('dbTransient: attempt timeout forceReset dinamik import ile', () => {
  const source = readFileSync(join(root, 'api/_lib/dbTransient.js'), 'utf8');
  assert.match(source, /forceResetSqlClient/);
  assert.match(source, /attempt_timeout/);
  assert.match(source, /onAttemptTimeout/);
});

test('runSql WRITE: attemptTimeoutMs yok (cift yazma yok)', () => {
  const source = readFileSync(join(root, 'api/_lib/runSql.js'), 'utf8');
  const runSqlBlock = source.slice(
    source.indexOf('export function runSql('),
    source.indexOf('export function runSqlRead')
  );
  assert.doesNotMatch(runSqlBlock, /attemptTimeoutMs:/);
});

test('authLogin: session_create route deadline disinda', () => {
  const source = readFileSync(join(root, 'api/_lib/handlers/authLogin.js'), 'utf8');
  const deadlineEnd = source.indexOf('}, ROUTE_TIMING.LOGIN_CREDENTIAL_MS');
  assert.ok(deadlineEnd > 0);
  const createCall = source.indexOf('session = await createSessionOnce');
  assert.ok(createCall > deadlineEnd, 'session_create deadline sarmalayicisindan sonra olmali');
});
