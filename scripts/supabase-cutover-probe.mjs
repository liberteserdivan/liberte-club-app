#!/usr/bin/env node
/**
 * Supabase final cutover doğrulama — production API + yerel Supabase okuma.
 * Neon'a yazım kanıtı: Vercel'de Neon env yok + production db-status supabase.
 *
 * Kullanım:
 *   node scripts/supabase-cutover-probe.mjs
 *   SMOKE_BASE_URL=https://app.liberte.cafe node scripts/supabase-cutover-probe.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeDatabaseUrl } from '../api/_lib/dbConnection.js';
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

async function fetchJson(path, options = {}) {
  const started = Date.now();
  const response = await fetch(`${BASE}${path}`, diagFetchInit({
    ...options,
    signal: AbortSignal.timeout(options.timeoutMs || 60000)
  }));
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  return { ok: response.ok, status: response.status, data, ms: Date.now() - started };
}

async function postRegisterProbe() {
  const ts = Date.now();
  const email = `cutover.probe.${ts}@liberte-test.invalid`;
  const phone = `554${String(ts).slice(-7)}`;
  const name = 'Cutover Probe';
  const pin = '9876';

  const send = await fetchJson('/api/auth/register-complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'send-code', phone, name, email })
  });

  if (!send.ok || !send.data?.ok) {
    return { ok: false, step: 'send-code', send, email, phone };
  }

  const sql = getSql();
  if (!sql) {
    return { ok: false, step: 'local-sql-missing', send, email, phone };
  }

  await new Promise((r) => setTimeout(r, 1500));
  const codeRows = await sql`
    SELECT code FROM email_codes
    WHERE email = ${email} AND phone = ${phone} AND purpose = 'register' AND used = false
    ORDER BY created_at DESC LIMIT 1
  `;
  const code = codeRows[0]?.code;
  if (!code) {
    await sql.end({ timeout: 5 });
    return { ok: false, step: 'code-not-found', send, email, phone };
  }

  const complete = await fetchJson('/api/auth/register-complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'complete',
      phone,
      name,
      email,
      pin,
      pinConfirm: pin,
      code: String(code),
      deviceId: 'cutover-probe'
    }),
    timeoutMs: 90000
  });

  const customerId = Number(complete.data?.customerId || 0);
  const checks = { customers: false, emails: false, pinAuth: false, session: false };

  if (customerId > 0) {
    const [cust, mail, pinRow, sess] = await Promise.all([
      sql`SELECT id, phone FROM customers WHERE id = ${customerId} LIMIT 1`,
      sql`SELECT email, customer_id FROM customer_emails WHERE customer_id = ${customerId} LIMIT 1`,
      sql`SELECT phone FROM customer_pin_auth WHERE phone = ${phone} LIMIT 1`,
      sql`SELECT id FROM auth_sessions WHERE customer_id = ${customerId} ORDER BY created_at DESC LIMIT 1`
    ]);
    checks.customers = cust.length > 0;
    checks.emails = mail.length > 0;
    checks.pinAuth = pinRow.length > 0;
    checks.session = sess.length > 0;
  }

  await sql.end({ timeout: 5 });

  return {
    ok: complete.ok && complete.data?.ok && checks.customers && checks.emails && checks.pinAuth && checks.session,
    step: 'complete',
    email,
    phone,
    customerId,
    checks,
    send,
    complete
  };
}

loadEnv();

const report = {
  baseUrl: BASE,
  timestamp: new Date().toISOString(),
  vercelEnvVars: {
    note: 'Vercel CLI: yalnızca DATABASE_URL (Production+Preview). Neon/POSTGRES_* yok.',
    databaseUrlPresent: true,
    neonVarsPresent: false
  },
  productionDbStatus: null,
  localDatabase: null,
  registerProbe: null,
  endpointSmoke: [],
  neonWritePossible: false,
  cutoverReady: false
};

console.log('=== Supabase Cutover Probe ===\n');

const dbStatus = await fetchJson('/api/config?resource=db-status');
report.productionDbStatus = dbStatus.data;
console.log('1) production db-status:', dbStatus.status, `${dbStatus.ms}ms`);
console.log('   provider:', dbStatus.data?.provider);
console.log('   hostMasked:', dbStatus.data?.hostMasked);
console.log('   port:', dbStatus.data?.port);
console.log('   pooler:', dbStatus.data?.pooler);
console.log('   transactionPooler:', dbStatus.data?.transactionPooler);
console.log('   pingOk:', dbStatus.data?.pingOk);
console.log('   neonBlocked:', dbStatus.data?.neonBlocked);

const localUrl = process.env.DATABASE_URL || '';
if (localUrl) {
  const info = describeDatabaseUrl(localUrl);
  report.localDatabase = {
    provider: info.provider,
    hostMasked: info.hostMasked,
    port: info.port,
    pooler: info.pooler,
    transactionPooler: info.transactionPooler,
    matchesProduction: info.provider === dbStatus.data?.provider
  };
  console.log('\n2) yerel DATABASE_URL:', info.provider, info.hostMasked, `:${info.port}`);
} else {
  console.log('\n2) yerel DATABASE_URL: eksik (yalnızca API probe)');
}

const register = await postRegisterProbe();
report.registerProbe = {
  ok: register.ok,
  step: register.step,
  customerId: register.customerId || null,
  checks: register.checks || null,
  requestId: register.complete?.data?.requestId || register.send?.data?.requestId || null
};
console.log('\n3) production kayıt probe:', register.ok ? 'OK' : `FAIL (${register.step})`);
if (register.checks) {
  console.log('   customers:', register.checks.customers ? 'OK' : 'YOK');
  console.log('   customer_emails:', register.checks.emails ? 'OK' : 'YOK');
  console.log('   customer_pin_auth:', register.checks.pinAuth ? 'OK' : 'YOK');
  console.log('   auth_sessions:', register.checks.session ? 'OK' : 'YOK');
}

const smokePaths = [
  ['login-invalid', '/api/auth/login', { method: 'POST', body: JSON.stringify({ phone: '5550000001', pin: '0000' }) }],
  ['qr-unauth', '/api/qr/generate', { method: 'POST', body: JSON.stringify({}) }],
  ['push-unauth', '/api/admin?resource=push-send', { method: 'POST', body: JSON.stringify({ title: 't', body: 'b' }) }],
  ['review-unauth', '/api/admin?resource=review-action', { method: 'POST', body: JSON.stringify({ action: 'approve', requestId: 1 }) }]
];

for (const [name, path, options] of smokePaths) {
  const row = await fetchJson(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const pass = row.status === 401 || row.status === 403 || row.status === 400 || row.status === 404;
  report.endpointSmoke.push({ name, status: row.status, pass, ms: row.ms });
  console.log(`4) ${name}:`, row.status, pass ? 'OK' : 'WARN', `${row.ms}ms`);
}

report.neonWritePossible = dbStatus.data?.provider === 'neon';
report.cutoverReady = Boolean(
  dbStatus.data?.ok
  && dbStatus.data?.provider === 'supabase'
  && dbStatus.data?.transactionPooler
  && dbStatus.data?.pingOk
  && !report.neonWritePossible
  && register.ok
);

console.log('\n=== ÖZET ===');
console.log('Production host:', dbStatus.data?.hostMasked, ':', dbStatus.data?.port);
console.log('Supabase pooler :6543:', dbStatus.data?.transactionPooler ? 'EVET' : 'HAYIR');
console.log('Neon env (Vercel):', report.vercelEnvVars.neonVarsPresent ? 'VAR' : 'YOK');
console.log('Production Neon yazım mümkün:', report.neonWritePossible ? 'EVET (KRİTİK)' : 'HAYIR');
console.log('Kayıt Supabase tablolarına düştü:', register.ok ? 'EVET' : 'HAYIR');
console.log('Neon kapatmaya hazır (48s gözlem önerilir):', report.cutoverReady ? 'EVET' : 'HAYIR');

process.exit(report.cutoverReady ? 0 : 1);
