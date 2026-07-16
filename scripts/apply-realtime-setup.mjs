#!/usr/bin/env node
/**
 * 002_realtime_setup.sql — güvenli, idempotent uygulama + doğrulama raporu
 * Kullanım: node scripts/apply-realtime-setup.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql } from './_lib/getSql.mjs';
import { describeDatabaseUrl } from '../api/_lib/dbConnection.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sqlFile = join(root, 'scripts', 'sql', '002_realtime_setup.sql');

const EXPECTED_PUBLICATION_TABLES = [
  'customer_loyalty',
  'loyalty_events',
  'in_app_notifications',
  'campaigns',
  'coupons',
  'customers',
  'push_send_log'
];

function loadEnv() {
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

loadEnv();

const dbInfo = describeDatabaseUrl(process.env.DATABASE_URL || '');
console.log('=== Realtime SQL Uygulama ===');
console.log('Hedef:', dbInfo.provider, dbInfo.hostMasked, `:${dbInfo.port}`);

const sql = getSql();
if (!sql) {
  console.error('DATABASE_URL eksik.');
  process.exit(1);
}

const script = readFileSync(sqlFile, 'utf8');

try {
  await sql.unsafe(script);

  const pubRows = await sql`
    SELECT tablename
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
    ORDER BY tablename
  `;
  const published = new Set(pubRows.map((row) => row.tablename));

  const cols = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'in_app_notifications'
    ORDER BY column_name
  `;
  const colSet = new Set(cols.map((row) => row.column_name));

  console.log('\n--- Publication (supabase_realtime) ---');
  for (const table of EXPECTED_PUBLICATION_TABLES) {
    console.log(`  ${published.has(table) ? 'OK' : 'EKSIK'}  ${table}`);
  }

  console.log('\n--- in_app_notifications kolonları ---');
  for (const col of ['target_type', 'read_at', 'payload', 'is_active', 'customer_id', 'title', 'body']) {
    console.log(`  ${colSet.has(col) ? 'OK' : 'EKSIK'}  ${col}`);
  }

  const missing = EXPECTED_PUBLICATION_TABLES.filter((t) => !published.has(t));
  if (missing.length) {
    console.error('\nHATA: Eksik publication tabloları:', missing.join(', '));
    process.exit(1);
  }

  console.log('\nSQL uygulaması başarılı (destructive işlem yok).');
} catch (error) {
  console.error('SQL hatası:', error?.message || error);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}
