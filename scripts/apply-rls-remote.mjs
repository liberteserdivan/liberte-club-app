#!/usr/bin/env node
/**
 * Production üzerinde RLS durumu / uygulama — CONFIG_DIAG_SECRET gerekir
 * Kullanım:
 *   node scripts/apply-rls-remote.mjs --check
 *   node scripts/apply-rls-remote.mjs --apply
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { diagFetchHeaders } from './_diagHeaders.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.SMOKE_BASE_URL || 'https://app.libertegastrocafe.com';
const apply = process.argv.includes('--apply');
const check = process.argv.includes('--check') || !apply;

// Yerel env dosyalarından secret yükle
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

const headers = {
  ...diagFetchHeaders(),
  'Content-Type': 'application/json'
};

async function fetchStatus() {
  const res = await fetch(`${base}/api/config?resource=rls-status`, { headers });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function postApply() {
  const res = await fetch(`${base}/api/config?resource=rls-apply`, {
    method: 'POST',
    headers
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

console.log('=== RLS Remote ===');
console.log('base:', base);

if (check) {
  const result = await fetchStatus();
  console.log('rls-status:', result.status, JSON.stringify(result.data, null, 2));
  if (!result.data?.ok) process.exitCode = 1;
}

if (apply) {
  const result = await postApply();
  console.log('rls-apply:', result.status, JSON.stringify(result.data, null, 2));
  if (!result.data?.ok) process.exitCode = 1;
}
