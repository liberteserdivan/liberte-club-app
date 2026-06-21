#!/usr/bin/env node
/**
 * Canlı admin üye listesi smoke testi — giriş + admin PIN + admin-customers
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = process.env.SMOKE_ORIGIN || 'https://app.liberte.cafe';

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
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

async function api(path, { method = 'GET', token = null, body = null, timeoutMs = 30000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${ORIGIN}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text.slice(0, 200) };
    }
    return { response, data };
  } finally {
    clearTimeout(timer);
  }
}

loadEnv();

const phone = process.env.SMOKE_ADMIN_PHONE || '5058665406';
const customerPin = process.env.SMOKE_ADMIN_CUSTOMER_PIN || process.env.SMOKE_CUSTOMER_PIN || '';
const adminPin = process.env.ADMIN_PIN || process.env.SMOKE_ADMIN_PIN || '';

if (!customerPin || !adminPin) {
  console.error('[smoke-admin-members] SMOKE_ADMIN_CUSTOMER_PIN ve ADMIN_PIN gerekli (.env)');
  process.exit(1);
}

const login = await api('/api/auth/login', {
  method: 'POST',
  body: { phone, pin: customerPin }
});

if (!login.response.ok || !login.data?.sessionToken) {
  console.log(JSON.stringify({
    ok: false,
    step: 'login',
    status: login.response.status,
    error: login.data?.error || login.data?.message || 'Giriş başarısız'
  }, null, 2));
  process.exit(1);
}

const token = login.data.sessionToken;

const pinAttempt = await api('/api/auth/admin-pin', {
  method: 'POST',
  token,
  body: { pin: adminPin }
});

if (!pinAttempt.response.ok) {
  console.log(JSON.stringify({
    ok: false,
    step: 'admin-pin',
    status: pinAttempt.response.status,
    error: pinAttempt.data?.error || pinAttempt.data?.message || 'Admin PIN başarısız'
  }, null, 2));
  process.exit(1);
}

const members = await api('/api/realtime?resource=admin-customers', { token, timeoutMs: 45000 });
const state = await api('/api/state', { token, timeoutMs: 45000 });

console.log(JSON.stringify({
  ok: true,
  origin: ORIGIN,
  adminPin: pinAttempt.data?.adminVerified === true,
  adminCustomers: {
    status: members.response.status,
    count: members.data?.count ?? members.data?.customers?.length ?? 0,
    ok: members.data?.ok === true
  },
  fullState: {
    status: state.response.status,
    customerCount: state.data?.data?.customers?.length ?? 0,
    adminVerified: state.data?.adminVerified === true,
    isAdmin: state.data?.isAdmin === true
  }
}, null, 2));

if ((members.data?.customers?.length || 0) < 1) {
  process.exit(2);
}
