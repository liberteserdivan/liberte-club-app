#!/usr/bin/env node
/**
 * Codemagic'te bir workflow build'ini tetikler.
 * Kullanım: node scripts/trigger-codemagic-build.mjs <workflowId> [branch]
 * Örn:     node scripts/trigger-codemagic-build.mjs android-release main
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// .env yükle — mevcut ortam değişkenlerini ezmez
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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadLocalEnv();

const token = String(process.env.CODEMAGIC_API_TOKEN || process.env.CM_API_TOKEN || '').trim();
const appId = String(process.env.CODEMAGIC_APP_ID || '6a27103ffb57938b06e2c701').trim();
const workflowId = process.argv[2];
const branch = String(process.argv[3] || 'main').trim();

if (!token || !workflowId) {
  console.error('Kullanım: node scripts/trigger-codemagic-build.mjs <workflowId> [branch]');
  process.exit(1);
}

const response = await fetch('https://api.codemagic.io/builds', {
  method: 'POST',
  headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
  body: JSON.stringify({ appId, workflowId, branch })
});

const text = await response.text();
if (!response.ok) {
  console.error(`Codemagic tetikleme hatasi (${response.status}):`, text);
  process.exit(1);
}

let buildId = null;
try {
  buildId = JSON.parse(text).buildId || null;
} catch {
  // yok say
}
console.log(`Build tetiklendi: workflow=${workflowId} branch=${branch} buildId=${buildId || text}`);
