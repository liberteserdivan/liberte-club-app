#!/usr/bin/env node
/**
 * RLS sonrası smoke — DB policy kontrolü + production API guard
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql } from './_lib/getSql.mjs';
import { diagFetchInit } from './_diagHeaders.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.SMOKE_BASE_URL || 'https://app.libertegastrocafe.com';

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

// DB tarafı — RLS açık mı?
const sql = getSql();
if (sql) {
  const rlsCheck = await sql`
    SELECT relname, relrowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND relkind = 'r'
      AND relname IN ('customers', 'customer_pin_auth', 'auth_sessions', 'menu_items', 'campaigns')
  `;
  const allRls = rlsCheck.every((r) => r.relrowsecurity);
  results.push({
    name: 'db RLS kritik tablolar',
    pass: allRls,
    detail: rlsCheck.map((r) => `${r.relname}:${r.relrowsecurity}`).join(', ')
  });

  const policies = await sql`
    SELECT COUNT(*)::int AS cnt FROM pg_policies WHERE schemaname = 'public'
  `;
  results.push({
    name: 'db policy sayısı',
    pass: policies[0]?.cnt >= 4,
    detail: `count=${policies[0]?.cnt}`
  });
} else {
  results.push({ name: 'db bağlantı', pass: false, detail: 'DATABASE_URL yok' });
}

// API guard — backend RLS bypass ile çalışmalı
const dbStatus = await get('/api/config?resource=db-status');
results.push({
  name: 'db-status ping',
  pass: dbStatus.data?.pingOk === true,
  detail: `provider=${dbStatus.data?.provider}`
});

const session = await get('/api/auth/session');
results.push({
  name: 'session anon',
  pass: session.status === 200 && session.data?.ok === false,
  detail: `ok=${session.data?.ok}`
});

const rt = await get('/api/realtime?resource=customer-loyalty');
results.push({
  name: 'realtime auth guard',
  pass: rt.status === 401,
  detail: `status=${rt.status}`
});

const adminPush = await fetch(`${BASE}/api/admin?resource=push-send`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'x', body: 'y' }),
  signal: AbortSignal.timeout(15000)
}).then((r) => r.status).catch(() => 0);
results.push({
  name: 'admin push guard',
  pass: adminPush === 401,
  detail: `status=${adminPush}`
});

const jwtOk = Boolean(String(process.env.SUPABASE_JWT_SECRET || '').trim());
results.push({
  name: 'SUPABASE_JWT_SECRET env',
  pass: jwtOk,
  detail: jwtOk ? 'set' : 'missing — realtime RLS token üretilemez'
});

console.log('=== RLS Smoke ===');
console.log('URL:', BASE);
for (const row of results) {
  console.log(`${row.pass ? 'PASS' : 'FAIL'}  ${row.name}  (${row.detail})`);
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\nÖzet: ${results.length - failed}/${results.length} geçti`);
process.exit(failed ? 1 : 0);
