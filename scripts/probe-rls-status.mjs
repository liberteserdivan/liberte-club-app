#!/usr/bin/env node
/**
 * Salt-okuma RLS / publication durumu (BUG-005).
 * Secret, connection string veya PII yazmaz.
 *
 *   node scripts/probe-rls-status.mjs
 *   LIBERTE_ENV_FILE=../liberte-club-app/.env node scripts/probe-rls-status.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql } from './_lib/getSql.mjs';
import { describeDatabaseUrl } from '../api/_lib/dbConnection.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(filePath) {
  if (!filePath || !existsSync(filePath)) return;
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key] && value) process.env[key] = value;
  }
}

for (const name of ['.env', '.env.local']) loadEnvFile(join(root, name));
if (process.env.LIBERTE_ENV_FILE) loadEnvFile(resolve(process.env.LIBERTE_ENV_FILE));

const info = describeDatabaseUrl(process.env.DATABASE_URL || '');
const sql = getSql();
if (!sql) {
  console.error(JSON.stringify({ ok: false, error: 'DATABASE_URL_MISSING' }));
  process.exit(2);
}

const SENSITIVE = [
  'customers',
  'customer_loyalty',
  'loyalty_events',
  'auth_sessions',
  'customer_pin_auth',
  'push_subscriptions'
];

try {
  const rls = await sql`
    SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relname = ANY(${SENSITIVE})
    ORDER BY c.relname
  `;
  const policies = await sql`
    SELECT tablename, count(*)::int AS policy_count
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = ANY(${SENSITIVE})
    GROUP BY tablename
    ORDER BY tablename
  `;
  const pub = await sql`
    SELECT tablename
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
    ORDER BY tablename
  `;
  const indexes = await sql`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN (
        'idx_auth_sessions_customer_id',
        'idx_auth_sessions_expires_at',
        'idx_email_codes_email_created_at'
      )
    ORDER BY indexname
  `;

  const policyMap = Object.fromEntries(policies.map((r) => [r.tablename, r.policy_count]));
  const summary = {
    ok: true,
    provider: info.provider || null,
    hostMasked: info.hostMasked || null,
    rls: rls.map((r) => ({
      table: r.table_name,
      enabled: Boolean(r.rls_enabled),
      policies: policyMap[r.table_name] || 0
    })),
    publicationTables: pub.map((r) => r.tablename),
    customersInRealtime: pub.some((r) => r.tablename === 'customers'),
    authIndexesPresent: indexes.map((r) => r.indexname),
    sensitiveWithoutRls: rls.filter((r) => !r.rls_enabled).map((r) => r.table_name)
  };
  console.log(JSON.stringify(summary, null, 2));
  await sql.end({ timeout: 1 });
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: String(error?.code || 'PROBE_FAILED')
  }));
  process.exit(1);
}
