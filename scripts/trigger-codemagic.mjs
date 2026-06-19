#!/usr/bin/env node
/**
 * Codemagic workflow tetikleyici (ios-release / android-release).
 *
 * Kullanım:
 *   node scripts/trigger-codemagic.mjs ios-release
 *   node scripts/trigger-codemagic.mjs android-release
 *
 * Token ve App ID: proje kökündeki .env veya ortam değişkeni.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// .env dosyasını yükle — mevcut ortam değişkenlerini ezmez
function loadLocalEnv() {
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

loadLocalEnv();

const workflowId = process.argv[2] || 'ios-release';
const branch = process.argv[3] || 'main';
const token = String(process.env.CODEMAGIC_API_TOKEN || process.env.CM_API_TOKEN || '').trim();
const appId = String(process.env.CODEMAGIC_APP_ID || '').trim();

const validWorkflows = new Set(['ios-release', 'android-release']);

if (!validWorkflows.has(workflowId)) {
  console.error(`Geçersiz workflow: ${workflowId}. Seçenekler: ios-release, android-release`);
  process.exit(1);
}

if (!token) {
  console.error('CODEMAGIC_API_TOKEN eksik.');
  console.error('  .env dosyasına ekleyin veya Codemagic → Account settings → API token');
  process.exit(1);
}

if (!appId) {
  console.error('CODEMAGIC_APP_ID eksik.');
  console.error('  .env dosyasına ekleyin: 6a27103ffb57938b06e2c701');
  process.exit(1);
}

const body = {
  appId,
  workflowId,
  branch
};

const response = await fetch('https://api.codemagic.io/builds', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-auth-token': token
  },
  body: JSON.stringify(body)
});

const text = await response.text();
let payload = text;
try {
  payload = JSON.parse(text);
} catch {
  // Ham metin
}

if (!response.ok) {
  console.error(`Codemagic hata (${response.status}):`, payload);
  process.exit(1);
}

console.log(`Build tetiklendi: workflow=${workflowId} branch=${branch}`);
console.log(JSON.stringify(payload, null, 2));
