#!/usr/bin/env node
/**
 * 5 kritik production akışı — API düzeyinde E2E (cihaz UI değil).
 * Kullanım: node scripts/e2e-critical-flows.mjs
 *
 * Gerekli ortam:
 *   DATABASE_URL — kayıt mail kodu okuma
 *   E2E_ADMIN_CUSTOMER_PIN — 05058665406 müşteri PIN (opsiyonel)
 *   ADMIN_PIN — yönetici panel PIN (opsiyonel, QR redeem için)
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql } from './_lib/getSql.mjs';
import { cleanPhone } from '../api/_lib/phone.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.SMOKE_BASE_URL || 'https://app.liberte.cafe';
const ADMIN_PHONE = cleanPhone(process.env.E2E_ADMIN_PHONE || '05058665406');

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

function authHeaders(token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function request(flow, url, options = {}) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(options.timeoutMs || 90000)
    });
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text.slice(0, 300) };
    }
    return {
      flow,
      ok: res.ok && data?.ok !== false,
      status: res.status,
      durationMs: Date.now() - started,
      requestId: data?.requestId || null,
      note: data?.message || data?.error || data?.code || null,
      data,
      token: data?.sessionToken || null
    };
  } catch (error) {
    return {
      flow,
      ok: false,
      status: 0,
      durationMs: Date.now() - started,
      requestId: null,
      note: error?.message || String(error),
      data: null,
      token: null
    };
  }
}

async function readActiveCode(sql, email, phone) {
  const rows = await sql`
    SELECT code
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

async function readLoyaltyStamp(sql, customerId) {
  const rows = await sql`
    SELECT stamps_coffee, updated_at
    FROM customer_loyalty
    WHERE customer_id = ${customerId}
    LIMIT 1
  `;
  return rows[0] || null;
}

loadEnv();

const rows = [];
const ts = Date.now();
const testEmail = `e2e.flow.${ts}@liberte-test.invalid`;
const testPhone = `555${String(ts).slice(-7)}`;
const testPin = '4321';
const deviceId = `e2e-device-${ts}`;

console.log('=== LIBERTE 5 KRİTİK AKIŞ E2E (Production API) ===');
console.log('base:', BASE);
console.log('');

// 1) Kayıt
const sendCode = await request('1-kayit-send-code', `${BASE}/api/auth?action=register-complete`, {
  method: 'POST',
  headers: authHeaders(),
  body: JSON.stringify({
    action: 'send-code',
    phone: testPhone,
    name: 'E2E Flow User',
    email: testEmail
  })
});
rows.push(sendCode);

let registerOk = false;
let memberToken = null;
let memberCustomerId = null;

if (sendCode.ok) {
  const sql = getSql();
  if (!sql) {
    rows.push({
      flow: '1-kayit-complete',
      ok: false,
      status: 0,
      durationMs: 0,
      requestId: null,
      note: 'DATABASE_URL yok — kod okunamadı',
      data: null,
      token: null
    });
  } else {
    await new Promise((r) => setTimeout(r, 1500));
    const code = await readActiveCode(sql, testEmail, testPhone);
    if (!code) {
      rows.push({
        flow: '1-kayit-complete',
        ok: false,
        status: 0,
        durationMs: 0,
        requestId: null,
        note: 'email_codes tablosunda aktif kod yok',
        data: null,
        token: null
      });
    } else {
      const complete = await request('1-kayit-complete', `${BASE}/api/auth?action=register-complete`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          action: 'complete',
          phone: testPhone,
          name: 'E2E Flow User',
          email: testEmail,
          birthDate: '',
          referralCode: '',
          pin: testPin,
          pinConfirm: testPin,
          code: String(code),
          deviceId
        })
      });
      rows.push(complete);
      registerOk = complete.ok;
      memberToken = complete.token;
      memberCustomerId = complete.data?.customerId || null;
    }
    await sql.end({ timeout: 5 });
  }
} else {
  rows.push({
    flow: '1-kayit-complete',
    ok: false,
    status: 0,
    durationMs: 0,
    requestId: sendCode.requestId,
    note: 'send-code başarısız — complete atlandı',
    data: null,
    token: null
  });
}

// 2) Normal login (yeni kayıt veya mevcut test kullanıcı)
const loginPhone = registerOk ? testPhone : testPhone;
const loginPin = registerOk ? testPin : testPin;
const login = await request('2-normal-login', `${BASE}/api/auth?action=login`, {
  method: 'POST',
  headers: authHeaders(),
  body: JSON.stringify({ phone: loginPhone, pin: loginPin, deviceId })
});
rows.push(login);
if (login.token) {
  memberToken = login.token;
  memberCustomerId = login.data?.customerId || memberCustomerId;
}

// Yanlış PIN kontrolü
const wrongPin = await request('2-login-wrong-pin', `${BASE}/api/auth?action=login`, {
  method: 'POST',
  headers: authHeaders(),
  body: JSON.stringify({ phone: loginPhone, pin: '0000', deviceId: `${deviceId}-wrong` })
});
rows.push({
  ...wrongPin,
  flow: '2-login-wrong-pin',
  ok: wrongPin.status === 401 || wrongPin.data?.code === 'PIN_INVALID'
});

// 3) Admin login — ayrı panel PIN artık gerekmez
const adminCustomerPin = String(process.env.E2E_ADMIN_CUSTOMER_PIN || '').trim();
let adminToken = null;

if (!adminCustomerPin) {
  rows.push({
    flow: '3-admin-login',
    ok: false,
    status: 0,
    durationMs: 0,
    requestId: null,
    note: 'E2E_ADMIN_CUSTOMER_PIN env eksik — admin telefon PIN bilinmiyor',
    data: null,
    token: null
  });
} else {
  const adminLogin = await request('3-admin-login', `${BASE}/api/auth?action=login`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ phone: ADMIN_PHONE, pin: adminCustomerPin, deviceId: `${deviceId}-admin` })
  });
  rows.push(adminLogin);
  if (adminLogin.ok) {
    adminToken = adminLogin.token;
  } else {
    adminToken = null;
  }
}

// 4) QR generate
if (!memberToken) {
  rows.push({
    flow: '4-qr-generate',
    ok: false,
    status: 0,
    durationMs: 0,
    requestId: null,
    note: 'Üye oturum token yok',
    data: null,
    token: null
  });
} else {
  const qrGen = await request('4-qr-generate', `${BASE}/api/qr/generate`, {
    method: 'POST',
    headers: authHeaders(memberToken),
    body: '{}'
  });
  rows.push(qrGen);

  // 5) QR redeem / LP
  const qrToken = qrGen.data?.token || qrGen.data?.qrToken;
  if (!qrToken) {
    rows.push({
      flow: '5-qr-redeem',
      ok: false,
      status: 0,
      durationMs: 0,
      requestId: qrGen.requestId,
      note: 'QR token üretilemedi',
      data: null,
      token: null
    });
  } else if (!adminToken) {
    rows.push({
      flow: '5-qr-redeem',
      ok: false,
      status: 0,
      durationMs: 0,
      requestId: null,
      note: 'Admin oturumu yok — kasa işlemi atlandı',
      data: null,
      token: null
    });
  } else {
    const sql = getSql();
    const before = sql && memberCustomerId
      ? await readLoyaltyStamp(sql, memberCustomerId)
      : null;

    const verify = await request('5-qr-verify', `${BASE}/api/admin?resource=qr-verify`, {
      method: 'POST',
      headers: authHeaders(adminToken),
      body: JSON.stringify({ token: qrToken })
    });
    rows.push(verify);

    const stamp = await request('5-qr-redeem-stamp', `${BASE}/api/admin?resource=loyalty-action`, {
      method: 'POST',
      headers: authHeaders(adminToken),
      body: JSON.stringify({ token: qrToken, action: 'stamp', category: 'coffee' })
    });
    rows.push(stamp);

    if (sql && memberCustomerId) {
      const after = await readLoyaltyStamp(sql, memberCustomerId);
      const delta = (after?.stamps_coffee || 0) - (before?.stamps_coffee || 0);
      rows.push({
        flow: '5-loyalty-db-delta',
        ok: stamp.ok && delta >= 1,
        status: stamp.status,
        durationMs: 0,
        requestId: stamp.requestId,
        note: `stamps_coffee: ${before?.stamps_coffee ?? '?'} → ${after?.stamps_coffee ?? '?'} (Δ${delta})`,
        data: { before, after },
        token: null
      });
      await sql.end({ timeout: 5 });
    }
  }
}

console.log('| Akış | Sonuç | Süre | RequestId | Not |');
console.log('|------|--------|------|-----------|-----|');
for (const row of rows) {
  const result = row.ok ? '✅ PASS' : '❌ FAIL';
  console.log(`| ${row.flow} | ${result} | ${row.durationMs}ms | ${row.requestId || '—'} | ${String(row.note || '').slice(0, 80)} |`);
}

const critical = ['1-kayit-complete', '2-normal-login', '3-admin-login', '4-qr-generate', '5-qr-redeem-stamp'];
const criticalRows = rows.filter((r) => critical.includes(r.flow));
const allCriticalPass = criticalRows.length >= 4 && criticalRows.every((r) => r.ok);

console.log('');
console.log('=== ÖZET ===');
console.log('Kayıt:', rows.find((r) => r.flow === '1-kayit-complete')?.ok ? 'PASS' : 'FAIL');
console.log('Login:', rows.find((r) => r.flow === '2-normal-login')?.ok ? 'PASS' : 'FAIL');
console.log('Admin:', rows.find((r) => r.flow === '3-admin-login')?.ok ? 'PASS' : 'SKIP/FAIL');
console.log('QR generate:', rows.find((r) => r.flow === '4-qr-generate')?.ok ? 'PASS' : 'FAIL');
console.log('QR redeem:', rows.find((r) => r.flow === '5-qr-redeem-stamp')?.ok ? 'PASS' : 'SKIP/FAIL');

process.exit(allCriticalPass ? 0 : 1);
