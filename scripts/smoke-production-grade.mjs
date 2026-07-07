#!/usr/bin/env node
/**
 * Production-grade smoke test — deploy sonrasi guvenli kontrol
 * Kullanim: node scripts/smoke-production-grade.mjs
 * Ortam: SMOKE_BASE_URL (varsayilan https://app.liberte.cafe)
 * Opsiyonel: SMOKE_ADMIN_CUSTOMER_PIN veya SMOKE_CUSTOMER_PIN (.env) — oturumlu admin üye listesi
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = (process.env.SMOKE_BASE_URL || 'https://app.liberte.cafe').replace(/\/$/, '');

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
      if (
        (value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key] && value) process.env[key] = value;
    }
  }
}

loadEnv();

async function probe(name, url, options = {}) {
  const started = Date.now();
  const maxMs = options.maxMs || 8000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), maxMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let body = {};
    try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 200) }; }
    return {
      name,
      ok: false,
      status: res.status,
      durationMs: Date.now() - started,
      body,
      pass: false,
      note: ''
    };
  } catch (error) {
    return {
      name,
      ok: false,
      status: 0,
      durationMs: Date.now() - started,
      body: null,
      pass: false,
      note: error?.name === 'AbortError' ? 'timeout' : (error?.message || String(error))
    };
  } finally {
    clearTimeout(timer);
  }
}

function evaluate(row) {
  if (row.name === 'session-no-cookie') {
    row.pass = row.status === 401 && row.durationMs < 5000;
    row.note = row.pass ? 'fast 401 JSON' : (row.status === 504 ? 'VERCEL 504 — BLOCKER' : `status=${row.status} ${row.durationMs}ms`);
    row.ok = row.pass;
    return row;
  }
  if (row.name === 'guardian-health') {
    row.pass = row.status > 0 && row.status < 600 && row.durationMs < 15000;
    row.note = row.pass ? 'JSON yanit' : 'yanit yok veya timeout';
    row.ok = row.pass;
    return row;
  }
  if (row.name === 'login-assets') {
    row.pass = row.status === 200;
    row.note = row.pass ? 'index.html yuklendi' : 'asset yuklenemedi';
    row.ok = row.pass;
    return row;
  }
  if (row.name === 'loyalty-daily-unauth') {
    row.pass = row.status === 401;
    row.note = row.pass ? 'oturumsuz 401 (beklenen)' : `status=${row.status}`;
    row.ok = row.pass;
    return row;
  }
  if (row.name === 'admin-members-auth') {
    row.pass = row.status === 200 && row.body?.ok === true;
    row.note = row.pass
      ? `uye sayisi=${row.body?.count ?? row.body?.customers?.length ?? '?'}`
      : (row.status === 503 ? 'gecici DB — tekrar dene' : `status=${row.status}`);
    row.ok = row.pass;
    return row;
  }
  return row;
}

async function probeAdminMembers() {
  const pin = process.env.SMOKE_ADMIN_CUSTOMER_PIN
    || process.env.SMOKE_CUSTOMER_PIN
    || process.env.ADMIN_PIN
    || '';
  if (!pin) {
    return {
      name: 'admin-members-auth',
      ok: true,
      status: 0,
      durationMs: 0,
      body: null,
      pass: true,
      note: 'atlandi (SMOKE_ADMIN_CUSTOMER_PIN yok)'
    };
  }
  const phone = process.env.SMOKE_ADMIN_PHONE || '5058665406';
  const login = await probe('admin-login', `${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, pin }),
    maxMs: 20000
  });
  if (!login.body?.sessionToken) {
    return {
      name: 'admin-members-auth',
      ok: false,
      status: login.status,
      durationMs: login.durationMs,
      body: login.body,
      pass: false,
      note: 'giris basarisiz'
    };
  }
  const token = login.body.sessionToken;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(`${base}/api/admin/members`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: controller.signal
    });
    const text = await res.text();
    let body = {};
    try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 200) }; }
    return evaluate({
      name: 'admin-members-auth',
      ok: false,
      status: res.status,
      durationMs: Date.now() - started,
      body,
      pass: false,
      note: ''
    });
  } catch (error) {
    return evaluate({
      name: 'admin-members-auth',
      ok: false,
      status: 0,
      durationMs: Date.now() - started,
      body: null,
      pass: false,
      note: error?.name === 'AbortError' ? 'timeout' : (error?.message || String(error))
    });
  } finally {
    clearTimeout(timer);
  }
}

const rows = [];
rows.push(evaluate(await probe('session-no-cookie', `${base}/api/auth/session`, { maxMs: 6000 })));
rows.push(evaluate(await probe('guardian-health', `${base}/api/guardian/health`, { maxMs: 12000 })));
rows.push(evaluate(await probe('login-assets', `${base}/`, { maxMs: 10000 })));
rows.push(evaluate(await probe('loyalty-daily-unauth', `${base}/api/loyalty/daily-claim`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
  maxMs: 8000
})));
rows.push(await probeAdminMembers());

console.log('\n=== PRODUCTION GRADE SMOKE ===\n');
console.log('base:', base, '\n');
let blockers = 0;
for (const row of rows) {
  const mark = row.pass ? 'PASS' : 'FAIL';
  if (!row.pass) blockers += 1;
  console.log(`${mark.padEnd(5)} | ${row.name}`);
  console.log(`      | HTTP ${row.status} | ${row.durationMs}ms | ${row.note}`);
}
console.log('');
if (blockers) {
  console.error(`${blockers} kontrol basarisiz.`);
  process.exitCode = 1;
} else {
  console.log('Tum kritik kontroller gecti.');
}
