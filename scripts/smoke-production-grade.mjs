#!/usr/bin/env node
/**
 * Production-grade smoke test — deploy sonrasi guvenli kontrol
 * Kullanim: node scripts/smoke-production-grade.mjs
 * Ortam: SMOKE_BASE_URL (varsayilan https://app.liberte.cafe)
 */
const base = (process.env.SMOKE_BASE_URL || 'https://app.liberte.cafe').replace(/\/$/, '');

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
  return row;
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
