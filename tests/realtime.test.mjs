import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveSupabaseProjectRef, readSupabasePublicConfig } from '../api/_lib/supabasePublicConfig.js';
import { createDebouncedTask } from '../src/lib/realtimeManager.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('deriveSupabaseProjectRef pooler URI parse eder', () => {
  const ref = deriveSupabaseProjectRef(
    'postgresql://postgres.abcdefgh:secret@aws-1-eu-central-1.pooler.supabase.com:6543/postgres'
  );
  assert.equal(ref, 'abcdefgh');
});

test('readSupabasePublicConfig secret sızdırmaz', () => {
  const prevUrl = process.env.SUPABASE_URL;
  const prevKey = process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_URL = 'https://demo.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-test-key';

  const config = readSupabasePublicConfig();
  assert.equal(config.url, 'https://demo.supabase.co');
  assert.equal(config.anonKey, 'anon-test-key');
  assert.equal(config.enabled, true);
  assert.ok(!JSON.stringify(config).includes('service_role'));

  process.env.SUPABASE_URL = prevUrl;
  process.env.SUPABASE_ANON_KEY = prevKey;
});

test('realtimeManager debounce tek çağrı yapar', async () => {
  let count = 0;
  const debounced = createDebouncedTask(40);
  debounced(() => { count += 1; });
  debounced(() => { count += 1; });
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(count, 1);
});

test('adminPushSend uygulama içi bildirim tablosuna yazmaz', () => {
  const handler = readFileSync(join(root, 'api/_lib/handlers/adminPushSend.js'), 'utf8');
  assert.doesNotMatch(handler, /insertInAppNotificationsForAudience/);
  assert.doesNotMatch(handler, /queueInAppNotificationSave/);
});

test('realtime API route ve config kayıtlı', () => {
  const config = readFileSync(join(root, 'api/config.js'), 'utf8');
  const vercel = readFileSync(join(root, 'vercel.json'), 'utf8');
  assert.match(config, /resource === 'supabase'/);
  assert.match(vercel, /api\/realtime/);
});

test('App logout realtime cleanup çağırır', () => {
  const app = readFileSync(join(root, 'src/App.jsx'), 'utf8');
  assert.match(app, /closeAllRealtimeChannels/);
  assert.match(app, /useCustomerRealtime/);
  assert.match(app, /useAdminRealtime/);
  assert.match(app, /onCustomersChanged/);
});

test('sql.js production Neon blok korunur', () => {
  const sql = readFileSync(join(root, 'api/_lib/sql.js'), 'utf8');
  assert.match(sql, /assertProductionDatabaseAllowed/);
});
