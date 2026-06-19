import test from 'node:test';
import assert from 'node:assert/strict';
import { describeDatabaseUrl } from '../api/_lib/dbConnection.js';

test('describeDatabaseUrl Supabase pooler tanır', () => {
  const info = describeDatabaseUrl(
    'postgresql://user:secret@aws-0-eu.pooler.supabase.com:6543/postgres?sslmode=require'
  );
  assert.equal(info.provider, 'supabase');
  assert.equal(info.port, 6543);
  assert.equal(info.pooler, true);
  assert.equal(info.transactionPooler, true);
  assert.equal(info.ssl, true);
  assert.ok(info.hostMasked?.includes('***'));
  assert.ok(!info.hostMasked?.includes('secret'));
});

test('describeDatabaseUrl Neon tanır', () => {
  const info = describeDatabaseUrl(
    'postgresql://user:secret@ep-cool-name.aws.neon.tech/neondb?sslmode=require'
  );
  assert.equal(info.provider, 'neon');
  assert.equal(info.ssl, true);
});

test('describeDatabaseUrl boş URL unknown döner', () => {
  const info = describeDatabaseUrl('');
  assert.equal(info.provider, 'unknown');
  assert.equal(info.hostMasked, null);
});
