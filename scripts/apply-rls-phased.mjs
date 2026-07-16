#!/usr/bin/env node
/**
 * RLS fazlarını sırayla uygular veya rollback yapar
 * Kullanım:
 *   node scripts/apply-rls-phased.mjs --phase=1
 *   node scripts/apply-rls-phased.mjs --rollback=1
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql } from './_lib/getSql.mjs';
import { describeDatabaseUrl } from '../api/_lib/dbConnection.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const phaseArg = process.argv.find((a) => a.startsWith('--phase='));
const rollbackArg = process.argv.find((a) => a.startsWith('--rollback='));
const phase = phaseArg ? phaseArg.split('=')[1] : null;
const rollback = rollbackArg ? rollbackArg.split('=')[1] : null;

const APPLY = {
  1: '003_rls_phase1_public_lowrisk.sql',
  2: '003_rls_phase2_customer_loyalty.sql',
  3: '003_rls_phase3_backend_only.sql',
  all: '003_rls_apply_all.sql'
};

const ROLLBACK = {
  1: '003_rls_phase1_rollback.sql',
  2: '003_rls_phase2_rollback.sql',
  3: '003_rls_phase3_rollback.sql'
};

function loadEnv() {
  for (const name of ['.env', '.env.local']) {
    const envPath = join(root, name);
    if (!existsSync(envPath)) continue;
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
    if (!process.env[key] && value) process.env[key] = value;
    }
  }
}

loadEnv();

// Boş .env.local placeholder'ları vercel env run değerlerini ezmesin
if (process.env.VERCEL_ENV && !String(process.env.DATABASE_URL || '').trim()) {
  delete process.env.DATABASE_URL;
}

const dbInfo = describeDatabaseUrl(process.env.DATABASE_URL || '');
const sql = getSql();
if (!sql) {
  console.error('DATABASE_URL eksik.');
  process.exit(1);
}

async function runSqlFile(file) {
  const script = readFileSync(join(root, 'scripts', 'sql', file), 'utf8');
  await sql.unsafe(script);
}

async function reportState(label) {
  const policyRows = await sql`
    SELECT tablename, policyname, cmd, roles::text AS roles
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname
  `;

  const rlsRows = await sql`
    SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname
  `;

  console.log(`\n=== ${label} ===`);
  console.log('RLS açık tablolar:');
  for (const row of rlsRows.filter((r) => r.rls_enabled)) {
    console.log(`  ${row.table_name}`);
  }
  console.log('\nPolicy listesi:');
  for (const row of policyRows) {
    console.log(`  ${row.tablename} | ${row.policyname} | ${row.cmd} | ${row.roles}`);
  }
}

try {
  console.log('=== RLS İşlem ===');
  console.log('Hedef:', dbInfo.provider, dbInfo.hostMasked, `:${dbInfo.port}`);

  if (rollback) {
    const file = ROLLBACK[rollback];
    if (!file) {
      console.error('Geçersiz rollback faz:', rollback);
      process.exit(1);
    }
    console.log(`Rollback faz ${rollback}: ${file}`);
    await runSqlFile(file);
    await reportState(`Rollback Faz ${rollback} tamam`);
    process.exit(0);
  }

  if (!phase) {
    console.error('--phase=1|2|3|all veya --rollback=1|2|3 gerekli');
    process.exit(1);
  }

  const file = APPLY[phase];
  if (!file) {
    console.error('Geçersiz faz:', phase);
    process.exit(1);
  }

  console.log(`Uygulama faz ${phase}: ${file}`);
  await runSqlFile(file);
  await reportState(`Faz ${phase} tamam`);

  const hasJwt = Boolean(String(process.env.SUPABASE_JWT_SECRET || '').trim());
  console.log(`\nhasSupabaseJwtSecret (yerel): ${hasJwt}`);
  console.log(`Sonraki: node scripts/smoke-rls-phase${phase}.mjs`);
} catch (error) {
  console.error('RLS hatası:', error?.message || error);
  process.exit(1);
}
