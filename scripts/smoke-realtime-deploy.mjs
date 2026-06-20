#!/usr/bin/env node
/**
 * Realtime deploy sonrası API smoke testleri
 */
const BASE = process.env.SMOKE_BASE_URL || 'https://app.liberte.cafe';

async function get(path) {
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(30000) });
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 120) }; }
    return { ok: res.ok, status: res.status, ms: Date.now() - started, data };
  } catch (error) {
    return { ok: false, status: 0, ms: Date.now() - started, error: error?.message };
  }
}

async function post(path, body) {
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000)
    });
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
    return { ok: res.ok, status: res.status, ms: Date.now() - started, data };
  } catch (error) {
    return { ok: false, status: 0, ms: Date.now() - started, error: error?.message };
  }
}

const results = [];

const db = await get('/api/config?resource=db-status');
results.push({
  name: 'db-status supabase',
  pass: db.data?.provider === 'supabase' && db.data?.pingOk,
  detail: `${db.data?.provider}:${db.data?.port} ping=${db.data?.pingOk}`
});

const supa = await get('/api/config?resource=supabase');
results.push({
  name: 'supabase config endpoint',
  pass: supa.status === 200,
  detail: `enabled=${supa.data?.enabled} url=${supa.data?.url ? 'set' : 'missing'}`
});

const rtLoyalty = await get('/api/realtime?resource=customer-loyalty');
results.push({
  name: 'realtime customer-loyalty auth',
  pass: rtLoyalty.status === 401,
  detail: `status=${rtLoyalty.status}`
});

const rtAdmin = await get('/api/realtime?resource=admin-feed');
results.push({
  name: 'realtime admin-feed auth',
  pass: rtAdmin.status === 401 || rtAdmin.status === 403,
  detail: `status=${rtAdmin.status}`
});

const push = await get('/api/config?resource=push-status');
results.push({
  name: 'push-status',
  pass: push.data?.adminReady === true,
  detail: `adminReady=${push.data?.adminReady}`
});

const pushUnauth = await post('/api/admin?resource=push-send', { title: 't', body: 'b' });
results.push({
  name: 'push-send auth guard',
  pass: pushUnauth.status === 401,
  detail: `status=${pushUnauth.status}`
});

console.log('=== Realtime Deploy Smoke ===');
console.log('URL:', BASE);
for (const row of results) {
  console.log(`${row.pass ? 'PASS' : 'FAIL'}  ${row.name}  (${row.detail})`);
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\nÖzet: ${results.length - failed}/${results.length} geçti`);
if (supa.data?.enabled === false) {
  console.log('\nUYARI: SUPABASE_URL + SUPABASE_ANON_KEY Vercel\'de yok — Realtime client devre dışı kalır.');
  console.log('Fallback: mevcut poll/sync API çalışmaya devam eder.');
}

process.exit(failed ? 1 : 0);
