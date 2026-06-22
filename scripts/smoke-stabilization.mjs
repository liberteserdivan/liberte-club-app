#!/usr/bin/env node
/**
 * Kritik akış smoke testi — production stabilizasyon
 * Kullanım: node scripts/smoke-stabilization.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { diagFetchHeaders } from './_diagHeaders.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Yerel .env dosyalarından CONFIG_DIAG_SECRET oku — commit edilmez
function loadLocalEnv() {
  for (const name of ['.env', '.env.local', '.env.vercel.smoke']) {
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
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

loadLocalEnv();

const base = process.env.SMOKE_BASE_URL || 'https://app.liberte.cafe';
const diagHeaders = diagFetchHeaders();

async function probe(name, url, options = {}) {
  const started = Date.now();
  try {
    const res = await fetch(url, options);
    const text = await res.text();
    let body = {};
    try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 300) }; }
    return {
      flow: name,
      ok: res.ok && body?.ok !== false,
      status: res.status,
      durationMs: Date.now() - started,
      requestId: body?.requestId || null,
      note: body?.recommendation || body?.code || body?.message || body?.error || null,
      body
    };
  } catch (error) {
    return {
      flow: name,
      ok: false,
      status: 0,
      durationMs: Date.now() - started,
      requestId: null,
      note: error?.message || String(error),
      body: null
    };
  }
}

const rows = [];

rows.push(await probe('db-status', `${base}/api/config?resource=db-status`, { headers: diagHeaders }));
rows.push(await probe('qr-status', `${base}/api/config?resource=qr-status`, { headers: diagHeaders }));
rows.push(await probe('qr-generate-unauth', `${base}/api/qr/generate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{}'
}));
rows.push(await probe('session-restore-unauth', `${base}/api/auth/session`));
rows.push(await probe('login-unauth', `${base}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone: '0000000000', pin: '0000' })
}));

console.log('\n=== LIBERTE STABILIZATION SMOKE ===\n');
console.log('base:', base);
console.log('');

for (const row of rows) {
  const expectedUnauth = row.flow.includes('unauth') && (
    row.status === 401
    || (row.flow === 'session-restore-unauth' && row.status === 200 && row.body?.ok === false)
    || (row.flow === 'login-unauth' && (row.status === 400 || row.status === 404))
  );
  const mark = row.ok ? 'PASS' : (expectedUnauth ? 'EXPECTED' : 'FAIL');
  console.log(`${mark.padEnd(8)} | ${row.flow}`);
  console.log(`         | HTTP ${row.status} | ${row.durationMs}ms | requestId: ${row.requestId || '—'}`);
  if (row.note) console.log(`         | ${String(row.note).slice(0, 120)}`);
  if (row.flow === 'db-status' && row.body) {
    console.log(`         | provider=${row.body.provider} port=${row.body.port} pooler=${row.body.pooler} relational=${row.body.useRelationalState}`);
    if (row.body.neonBlocked) console.log('         | KRİTİK: Production Neon tespit edildi!');
  }
  if (row.flow === 'qr-status' && row.body) {
    console.log(`         | signingReady=${row.body.signingReady} endpoint=${row.body.qrEndpoint}`);
  }
  console.log('');
}

const db = rows.find((r) => r.flow === 'db-status');
const qr = rows.find((r) => r.flow === 'qr-status');

if (db?.body?.provider === 'neon') {
  console.error('BLOCKER: Production DATABASE_URL hâlâ Neon. Supabase :6543 gerekli.');
  process.exitCode = 2;
} else if (db?.body?.provider === 'supabase' && db?.body?.transactionPooler) {
  console.log('DB OK: Supabase transaction pooler doğrulandı.');
}

if (!qr?.body?.signingReady) {
  console.error('BLOCKER: QR signing hazır değil (QR_SIGNING_SECRET veya ADMIN_PIN).');
  process.exitCode = process.exitCode || 3;
}
