import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inList } from './sqlIn.js';

const sqlDir = join(dirname(fileURLToPath(import.meta.url)), '../../scripts/sql');

// RLS SQL dosyasını oku
function readRlsScript(fileName) {
  return readFileSync(join(sqlDir, fileName), 'utf8');
}

// Kritik tablolarda RLS durumunu özetle
export async function readRlsStatus(sql) {
  const tables = [
    'customers', 'customer_pin_auth', 'auth_sessions',
    'menu_items', 'campaigns', 'customer_loyalty'
  ];

  const rlsRows = await sql`
    SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relname IN ${inList(sql, tables)}
    ORDER BY c.relname
  `;

  const policies = await sql`
    SELECT COUNT(*)::int AS cnt FROM pg_policies WHERE schemaname = 'public'
  `;

  const policyCount = Number(policies[0]?.cnt || 0);
  const allCritical = rlsRows.length > 0 && rlsRows.every((r) => r.rls_enabled);
  const ready = allCritical && policyCount >= 4;

  return {
    ok: ready,
    policyCount,
    tables: rlsRows.map((r) => ({
      name: r.table_name,
      rlsEnabled: Boolean(r.rls_enabled)
    }))
  };
}

// Tüm RLS fazlarını uygula — idempotent SQL
export async function applyAllRls(sql) {
  const script = readRlsScript('003_rls_apply_all.sql');
  await sql.unsafe(script);
  return readRlsStatus(sql);
}
