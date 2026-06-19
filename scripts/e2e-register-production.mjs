#!/usr/bin/env node
/**
 * Production kayıt E2E — send-code + DB'den kod okuma + complete + duplicate 409
 * Kullanım: node scripts/e2e-register-production.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql } from './_lib/getSql.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://app.liberte.cafe/api/auth/register-complete';

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

async function postJson(body) {
  const started = Date.now();
  const response = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000)
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  return { status: response.status, data, ms: Date.now() - started };
}

async function readActiveCode(sql, email, phone) {
  const rows = await sql`
    SELECT code, used, expires_at
    FROM email_codes
    WHERE email = ${email}
      AND phone = ${phone}
      AND purpose = 'register'
      AND used = false
      AND expires_at > now()
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return rows[0]?.code || null;
}

loadEnv();

const ts = Date.now();
const email = `e2e.reg.${ts}@liberte-test.invalid`;
const phone = `555${String(ts).slice(-7)}`;
const name = 'E2E Test User';
const pin = '4321';

console.log('=== E2E Register Production ===');
console.log('email:', email);
console.log('phone:', phone);

const send = await postJson({ action: 'send-code', phone, name, email });
console.log('\n1) send-code:', send.status, `${send.ms}ms`, JSON.stringify(send.data));

if (send.status !== 200 || !send.data?.ok) {
  console.error('send-code başarısız');
  process.exit(1);
}

const sql = getSql();
if (!sql) {
  console.error('DATABASE_URL yok — kod okunamadı');
  process.exit(1);
}

await new Promise((r) => setTimeout(r, 1500));
const code = await readActiveCode(sql, email, phone);
if (!code) {
  console.error('email_codes tablosunda aktif kod bulunamadı');
  await sql.end({ timeout: 5 });
  process.exit(1);
}

console.log('DB kod okundu (6 hane)');

const complete = await postJson({
  action: 'complete',
  phone,
  name,
  email,
  birthDate: '',
  referralCode: '',
  pin,
  pinConfirm: pin,
  code: String(code),
  deviceId: 'e2e-probe'
});

console.log('\n2) complete:', complete.status, `${complete.ms}ms`, JSON.stringify({
  ok: complete.data?.ok,
  requestId: complete.data?.requestId,
  customerId: complete.data?.customerId,
  next: complete.data?.next,
  hasSession: Boolean(complete.data?.sessionToken),
  step: complete.data?.step,
  message: complete.data?.message
}));

if (complete.status !== 200 || !complete.data?.ok) {
  console.error('complete başarısız — Ref:', complete.data?.requestId);
  await sql.end({ timeout: 5 });
  process.exit(1);
}

const dupSend = await postJson({ action: 'send-code', phone, name, email });
console.log('\n3) duplicate send-code:', dupSend.status, `${dupSend.ms}ms`, JSON.stringify({
  ok: dupSend.data?.ok,
  code: dupSend.data?.code,
  step: dupSend.data?.step,
  message: dupSend.data?.message,
  requestId: dupSend.data?.requestId
}));

const dupComplete = await postJson({
  action: 'complete',
  phone,
  name,
  email,
  pin,
  pinConfirm: pin,
  code: '000000',
  deviceId: 'e2e-probe-dup'
});
console.log('\n4) duplicate complete (used code):', dupComplete.status, `${dupComplete.ms}ms`, JSON.stringify({
  ok: dupComplete.data?.ok,
  code: dupComplete.data?.code,
  step: dupComplete.data?.step,
  message: dupComplete.data?.message,
  requestId: dupComplete.data?.requestId
}));

const hasPin = await sql`
  SELECT phone FROM customer_pin_auth WHERE phone = ${phone} LIMIT 1
`;
console.log('\n5) pin_auth satırı:', hasPin.length ? 'OK' : 'YOK');

await sql.end({ timeout: 5 });

const dup409 = dupSend.status === 409 || dupComplete.status === 409;
console.log('\n=== ÖZET ===');
console.log('Tam kayıt:', complete.data?.ok ? 'BAŞARILI' : 'BAŞARISIZ');
console.log('Duplicate 409:', dup409 ? 'EVET' : 'HAYIR');
console.log('Complete requestId:', complete.data?.requestId);

process.exit(complete.data?.ok && dup409 ? 0 : 1);
