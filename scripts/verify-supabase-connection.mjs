#!/usr/bin/env node
/**
 * Faz 1 — Supabase bağlantı ve şema doğrulama (yerel).
 * Kullanım: DATABASE_URL=... node scripts/verify-supabase-connection.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql } from './_lib/getSql.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const REQUIRED_TABLES = [
  'app_state',
  'app_state_backups',
  'auth_sessions',
  'customer_pin_auth',
  'email_codes',
  'customer_emails',
  'app_error_logs',
  'auth_rate_limits',
  'customer_loyalty',
  'loyalty_events',
  'push_subscriptions',
  'menu_items'
];

function loadLocalEnv() {
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function describeUrl(url) {
  const value = String(url || '');
  if (!value) return 'eksik';
  const isPooler = /pooler\.supabase\.com/i.test(value);
  const isTransaction = /:6543(\/|\?|$)/.test(value);
  const isDirect = /db\.[a-z0-9]+\.supabase\.co:5432/i.test(value);
  if (isTransaction) return 'transaction pooler (:6543)';
  if (isDirect) return 'direct (:5432)';
  if (isPooler) return 'pooler (session?)';
  return 'postgres URI';
}

loadLocalEnv();

const url = process.env.DATABASE_URL || '';
if (!url) {
  console.error('DATABASE_URL eksik. .env veya ortam değişkeni olarak Transaction URI verin.');
  process.exit(1);
}

console.log('Bağlantı tipi:', describeUrl(url));

const sql = getSql();
if (!sql) {
  console.error('getSql() başarısız.');
  process.exit(1);
}

try {
  const ping = await sql`SELECT current_database() AS db, version() AS version`;
  console.log('Ping OK:', ping[0]?.db);

  const tables = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  const names = new Set(tables.map((row) => row.table_name));
  const missing = REQUIRED_TABLES.filter((name) => !names.has(name));

  if (missing.length) {
    console.error('Eksik tablolar:', missing.join(', '));
    process.exit(1);
  }

  console.log('Zorunlu tablolar:', REQUIRED_TABLES.length, '/', REQUIRED_TABLES.length, 'OK');

  const state = await sql`SELECT id, updated_at FROM app_state LIMIT 1`;
  console.log('app_state satırı:', state.length ? state[0].id : '(henüz boş — ilk API isteğinde seed)');

  const write = await sql`
    INSERT INTO auth_rate_limits (rate_key, hit_count, window_start)
    VALUES (${'phase1-probe-' + Date.now()}, 1, now())
    ON CONFLICT (rate_key) DO UPDATE SET hit_count = 1
    RETURNING rate_key
  `;
  console.log('Yazma testi OK:', write[0]?.rate_key ? 'auth_rate_limits' : 'fail');

  console.log('Supabase bağlantı doğrulaması başarılı.');
} catch (error) {
  console.error('Bağlantı hatası:', error?.message || error);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}
