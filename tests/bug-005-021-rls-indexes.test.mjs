import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('BUG-021 auth index migration dosyasi', () => {
  const sql = readFileSync(join(root, 'scripts/sql/011_auth_indexes.sql'), 'utf8');
  assert.match(sql, /idx_auth_sessions_customer_id/);
  assert.match(sql, /idx_auth_sessions_expires_at/);
  assert.match(sql, /idx_email_codes_email_created_at/);
  assert.doesNotMatch(sql, /DROP TABLE/i);
  });

test('BUG-005 realtime customers publication daraltma SQL', () => {
  const sql = readFileSync(join(root, 'scripts/sql/012_realtime_drop_customers_publication.sql'), 'utf8');
  assert.match(sql, /DROP TABLE public\.customers/);
  assert.match(sql, /supabase_realtime/);
  assert.doesNotMatch(sql, /TRUNCATE/i);
});

test('probe-rls-status ve apply-auth-indexes scriptleri var', () => {
  assert.ok(existsSync(join(root, 'scripts/probe-rls-status.mjs')));
  assert.ok(existsSync(join(root, 'scripts/apply-auth-indexes.mjs')));
  const probe = readFileSync(join(root, 'scripts/probe-rls-status.mjs'), 'utf8');
  assert.match(probe, /relrowsecurity/);
  assert.match(probe, /pg_publication_tables/);
});

test('package.json RLS probe scriptleri', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts['db:probe-rls']);
  assert.ok(pkg.scripts['db:apply-auth-indexes']);
});
