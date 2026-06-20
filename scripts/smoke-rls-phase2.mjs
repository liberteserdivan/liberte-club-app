#!/usr/bin/env node
/**
 * RLS Faz 2 smoke — müşteri/sadakat tabloları
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql } from './_lib/getSql.mjs';

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

async function fetchJson(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    signal: AbortSignal.timeout(options.timeoutMs || 45000)
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

const results = [];
const sql = getSql();

if (sql) {
  const phase2Tables = ['customers', 'customer_loyalty', 'loyalty_events', 'push_subscriptions', 'customer_emails'];
  const rls = await sql`
    SELECT relname, relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND relkind = 'r' AND relname = ANY(${phase2Tables})
  `;
  const allOn = phase2Tables.every((t) => rls.find((r) => r.relname === t)?.relrowsecurity);
  results.push({ name: 'Faz2 RLS açık', pass: allOn, detail: rls.map((r) => `${r.relname}:${r.relrowsecurity}`).join(',') });

  const policies = await sql`
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('customer_loyalty', 'loyalty_events', 'customers')
  `;
  results.push({ name: 'Faz2 JWT policy var', pass: policies.length >= 3, detail: `count=${policies.length}` });

  const pinRls = await sql`
    SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND relname = 'customer_pin_auth'
  `;
  results.push({
    name: 'customer_pin_auth henüz RLS kapalı (Faz3)',
    pass: !pinRls[0]?.relrowsecurity,
    detail: String(pinRls[0]?.relrowsecurity)
  });
}

// Kayıt + login probe (email_codes backend erişimi)
const ts = Date.now();
const email = `rls.faz2.${ts}@liberte-test.invalid`;
const phone = `553${String(ts).slice(-7)}`;
const pin = '4321';

try {
  const send = await fetchJson('/api/auth/register-complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'send-code', phone, name: 'RLS Faz2', email })
  });
  results.push({ name: 'Kayıt send-code', pass: send.data?.ok === true, detail: `status=${send.status}` });

  if (sql && send.data?.ok) {
    await new Promise((r) => setTimeout(r, 1500));
    const codes = await sql`
      SELECT code FROM email_codes WHERE email = ${email} AND phone = ${phone} AND used = false
      ORDER BY created_at DESC LIMIT 1
    `;
    const code = codes[0]?.code;
    if (code) {
      const complete = await fetchJson('/api/auth/register-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete', phone, name: 'RLS Faz2', email, code, pin, pinConfirm: pin })
      });
      results.push({
        name: 'Kayıt complete',
        pass: complete.data?.ok === true,
        detail: `customerId=${complete.data?.customerId}`
      });
      results.push({
        name: 'realtimeToken döndü',
        pass: Boolean(complete.data?.realtimeToken),
        detail: complete.data?.realtimeToken ? 'present' : 'missing'
      });

      if (complete.data?.sessionToken) {
        const login = await fetchJson('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${complete.data.sessionToken}`
          },
          body: JSON.stringify({ phone, pin })
        });
        results.push({ name: 'Login reuse', pass: login.data?.ok === true, detail: `status=${login.status}` });
      }
    } else {
      results.push({ name: 'Kayıt complete', pass: false, detail: 'email code bulunamadı' });
    }
  }
} catch (error) {
  results.push({ name: 'Kayıt/login probe', pass: false, detail: error?.message });
}

const db = await fetchJson('/api/config?resource=db-status');
results.push({ name: 'DB ping', pass: db.data?.pingOk === true, detail: '' });

console.log('=== RLS Faz 2 Smoke ===');
console.log('URL:', BASE);
for (const row of results) {
  console.log(`${row.pass ? 'PASS' : 'FAIL'}  ${row.name}  (${row.detail})`);
}
const failed = results.filter((r) => !r.pass).length;
console.log(`\nÖzet: ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
