#!/usr/bin/env node
/**
 * RLS Faz 3 smoke — full güvenlik + kritik akışlar
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql } from './_lib/getSql.mjs';
import { diagFetchInit } from './_diagHeaders.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.SMOKE_BASE_URL || 'https://app.libertegastrocafe.com';

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

async function fetchJson(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, diagFetchInit({
    ...options,
    signal: AbortSignal.timeout(options.timeoutMs || 45000)
  }));
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

const results = [];
const sql = getSql();

const phase3Tables = [
  'customer_pin_auth', 'auth_sessions', 'email_codes', 'auth_rate_limits',
  'app_error_logs', 'app_state', 'app_state_backups', 'coupon_uses'
];

if (sql) {
  const rls = await sql`
    SELECT relname, relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND relkind = 'r' AND relname = ANY(${phase3Tables})
  `;
  const allOn = phase3Tables.every((t) => rls.find((r) => r.relname === t)?.relrowsecurity);
  results.push({ name: 'Faz3 RLS açık (8 tablo)', pass: allOn, detail: `${rls.filter((r) => r.relrowsecurity).length}/${phase3Tables.length}` });

  const denyPolicies = await sql`
    SELECT count(*)::int AS c FROM pg_policies
    WHERE schemaname = 'public' AND tablename = ANY(${phase3Tables})
  `;
  results.push({
    name: 'Faz3 tablolarında policy yok (backend-only)',
    pass: denyPolicies[0]?.c === 0,
    detail: `policyCount=${denyPolicies[0]?.c}`
  });
}

const supa = await fetchJson('/api/config?resource=supabase');
results.push({ name: 'hasSupabaseJwtSecret prod', pass: supa.data?.hasSupabaseJwtSecret === true, detail: String(supa.data?.hasSupabaseJwtSecret) });

const session = await fetchJson('/api/auth/session');
results.push({ name: 'Session restore anon', pass: session.status === 200 && session.data?.ok === false, detail: '' });

const wrongPin = await fetchJson('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone: '5058665406', pin: '0000' })
});
results.push({ name: 'Yanlış PIN reddi', pass: wrongPin.status === 400 || wrongPin.status === 404, detail: `status=${wrongPin.status}` });

const adminPush = await fetchJson('/api/admin?resource=push-send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'x', body: 'y' })
});
results.push({ name: 'Admin API 401', pass: adminPush.status === 401, detail: `status=${adminPush.status}` });

const rt = await fetchJson('/api/realtime?resource=admin-feed');
results.push({ name: 'Realtime admin guard', pass: rt.status === 401 || rt.status === 403, detail: `status=${rt.status}` });

const qr = await fetchJson('/api/qr/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
results.push({ name: 'QR generate guard', pass: qr.status === 401, detail: `status=${qr.status}` });

const db = await fetchJson('/api/config?resource=db-status');
results.push({ name: 'DB ping', pass: db.data?.pingOk === true, detail: `provider=${db.data?.provider}` });

console.log('=== RLS Faz 3 Full Smoke ===');
console.log('URL:', BASE);
for (const row of results) {
  console.log(`${row.pass ? 'PASS' : 'FAIL'}  ${row.name}  (${row.detail})`);
}
const failed = results.filter((r) => !r.pass).length;
console.log(`\nÖzet: ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
