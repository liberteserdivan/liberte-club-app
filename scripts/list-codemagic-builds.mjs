#!/usr/bin/env node
/**
 * Son Codemagic build'lerini listeler (id, workflow, durum, branch, commit).
 * Kullanım: node scripts/list-codemagic-builds.mjs [adet]
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
const limit = Number(process.argv[2] || 8);

if (!token) {
  console.error('CODEMAGIC_API_TOKEN eksik');
  process.exit(1);
}

const response = await fetch(`https://api.codemagic.io/builds?appId=${appId}`, {
  headers: { 'x-auth-token': token }
});

if (!response.ok) {
  console.error(`Codemagic hata (${response.status}):`, await response.text());
  process.exit(1);
}

const payload = await response.json();
const builds = Array.isArray(payload.builds) ? payload.builds : [];

const rows = builds.slice(0, limit).map((build) => ({
  id: build._id || build.id,
  workflow: build.workflowId,
  status: build.status,
  branch: build.branch,
  commit: (build.commit?.hash || build.commitHash || '').slice(0, 7),
  version: build.appVersion || null,
  buildNumber: build.buildNumber ?? null,
  startedAt: build.startedAt || null
}));

console.log(JSON.stringify(rows, null, 2));
