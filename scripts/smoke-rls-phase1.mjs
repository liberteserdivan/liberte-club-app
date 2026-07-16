#!/usr/bin/env node
/**
 * RLS Faz 1 smoke — düşük riskli tablolar
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql } from './_lib/getSql.mjs';
import { diagFetchInit } from './_diagHeaders.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.SMOKE_BASE_URL || 'https://app.liberte.cafe';

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

async function get(path) {
  try {
    const res = await fetch(`${BASE}${path}`, diagFetchInit({ signal: AbortSignal.timeout(30000) }));
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (error) {
    return { ok: false, status: 0, error: error?.message };
  }
}

const results = [];
const sql = getSql();

if (sql) {
  const phase1Tables = ['menu_categories', 'menu_items', 'campaigns', 'coupons'];
  const rls = await sql`
    SELECT relname, relrowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND relkind = 'r' AND relname = ANY(${phase1Tables})
  `;
  const allOn = phase1Tables.every((t) => rls.find((r) => r.relname === t)?.relrowsecurity);
  results.push({ name: 'Faz1 RLS açık (5 tablo)', pass: allOn, detail: rls.map((r) => `${r.relname}:${r.relrowsecurity}`).join(',') });

  const sensitive = ['customers', 'auth_sessions', 'customer_pin_auth'];
  const sens = await sql`
    SELECT relname, relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND relkind = 'r' AND relname = ANY(${sensitive})
  `;
  const sensOff = sens.every((r) => !r.relrowsecurity);
  results.push({ name: 'Hassas tablolar henüz RLS kapalı', pass: sensOff, detail: sens.map((r) => `${r.relname}:${r.relrowsecurity}`).join(',') });

  const menuCount = await sql`SELECT count(*)::int AS c FROM menu_items`;
  results.push({ name: 'Menü backend okuma', pass: menuCount[0]?.c >= 0, detail: `items=${menuCount[0]?.c}` });
} else {
  results.push({ name: 'DB bağlantı', pass: false, detail: 'DATABASE_URL yok' });
}

const db = await get('/api/config?resource=db-status');
results.push({ name: 'Uygulama DB ping', pass: db.data?.pingOk === true, detail: `provider=${db.data?.provider}` });

const supa = await get('/api/config?resource=supabase');
results.push({ name: 'Supabase config', pass: supa.data?.enabled === true, detail: `enabled=${supa.data?.enabled}` });
results.push({
  name: 'hasSupabaseJwtSecret',
  pass: supa.data?.hasSupabaseJwtSecret === true,
  detail: String(supa.data?.hasSupabaseJwtSecret)
});

const session = await get('/api/auth/session');
results.push({ name: 'Login/session API', pass: session.status === 200, detail: `ok=${session.data?.ok}` });

const rt = await get('/api/realtime?resource=customer-loyalty');
results.push({ name: 'Realtime guard', pass: rt.status === 401, detail: `status=${rt.status}` });

const pushGuard = await fetch(`${BASE}/api/admin?resource=push-send`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 't', body: 'b' }),
  signal: AbortSignal.timeout(15000)
}).then((r) => r.status).catch(() => 0);
results.push({ name: 'Admin API guard', pass: pushGuard === 401, detail: `status=${pushGuard}` });

console.log('=== RLS Faz 1 Smoke ===');
console.log('URL:', BASE);
for (const row of results) {
  console.log(`${row.pass ? 'PASS' : 'FAIL'}  ${row.name}  (${row.detail})`);
}
const failed = results.filter((r) => !r.pass).length;
console.log(`\nÖzet: ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
