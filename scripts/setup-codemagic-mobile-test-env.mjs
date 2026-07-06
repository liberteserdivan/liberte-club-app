#!/usr/bin/env node
/**
 * Mobil smoke test secretlarini Codemagic liberte_android grubuna yazar ve build tetikler.
 * Kaynak: .env.mobile-test.local (gitignore) â€” degerler loglanmaz.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SECRET_KEYS = [
  'BROWSERSTACK_USERNAME',
  'BROWSERSTACK_ACCESS_KEY',
  'MOBILE_TEST_PHONE',
  'MOBILE_TEST_PIN'
];
const OPTIONAL_SECRET_KEYS = ['MOBILE_TEST_ADMIN_PIN'];
const GROUP_NAME = 'liberte_android';
const WORKFLOW_ID = 'android-mobile-smoke';

function loadEnvFile(relPath) {
  const envPath = join(root, relPath);
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

function readSecrets() {
  const out = {};
  const missing = [];
  for (const key of SECRET_KEYS) {
    const value = String(process.env[key] || '').trim();
    if (!value) missing.push(key);
    else out[key] = value;
  }
  for (const key of OPTIONAL_SECRET_KEYS) {
    const value = String(process.env[key] || '').trim();
    if (value) out[key] = value;
  }
  return { out, missing };
}

async function apiFetch(token, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-auth-token': token,
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  return { ok: response.ok, status: response.status, payload };
}

async function findGroupId(token, appId) {
  const url = `https://codemagic.io/api/v3/apps/${appId}/variable-groups?page_size=100&page=1`;
  const { ok, status, payload } = await apiFetch(token, url);
  if (!ok) throw new Error(`Variable group listesi alinamadi (${status})`);
  const groups = payload?.data || payload?.variableGroups || payload?.groups || [];
  const hit = groups.find((g) => String(g.name || g.groupName || '').trim() === GROUP_NAME);
  if (!hit) throw new Error(`"${GROUP_NAME}" grubu bulunamadi`);
  return hit._id || hit.id;
}

async function importVariables(token, groupId, variables) {
  const url = `https://codemagic.io/api/v3/variable-groups/${groupId}/variables`;
  const body = {
    secure: true,
    variables: Object.entries(variables).map(([name, value]) => ({ name, value }))
  };
  const { ok, status, payload } = await apiFetch(token, url, {
    method: 'POST',
    body: JSON.stringify(body)
  });
  if (!ok) {
    const msg = typeof payload === 'object' ? JSON.stringify(payload) : String(payload);
    throw new Error(`Variable import basarisiz (${status}): ${msg.slice(0, 240)}`);
  }
}

async function triggerSmokeBuild(token, appId, variables) {
  const body = { appId, workflowId: WORKFLOW_ID, branch: 'main', environment: { variables } };
  const { ok, status, payload } = await apiFetch(token, 'https://api.codemagic.io/builds', {
    method: 'POST',
    body: JSON.stringify(body)
  });
  if (!ok) throw new Error(`Build tetiklenemedi (${status})`);
  return payload?.buildId || payload?.build?._id || null;
}

async function main() {
  loadEnvFile('.env');
  loadEnvFile('.env.mobile-test.local');
  const token = String(process.env.CODEMAGIC_API_TOKEN || process.env.CM_API_TOKEN || '').trim();
  const appId = String(process.env.CODEMAGIC_APP_ID || '6a27103ffb57938b06e2c701').trim();
  const { out: secrets, missing } = readSecrets();
  if (!token) { console.error('CODEMAGIC_API_TOKEN eksik'); process.exit(1); }
  if (missing.length) {
    console.error(`Eksik: ${missing.join(', ')}`);
    console.error('Dosya: .env.mobile-test.local');
    process.exit(1);
  }
  console.log('[mobile-setup] Secret alanlari hazir (degerler loglanmaz)');
  const groupId = await findGroupId(token, appId);
  console.log(`[mobile-setup] Grup: ${GROUP_NAME}`);
  try {
    await importVariables(token, groupId, secrets);
    console.log('[mobile-setup] Codemagic grubuna yazildi');
  } catch (error) {
    if (String(error.message || '').includes('already exists')) {
      console.log('[mobile-setup] Degiskenler zaten mevcut — atlaniyor');
    } else {
      throw error;
    }
  }
  const buildId = await triggerSmokeBuild(token, appId, secrets);
  console.log(`[mobile-setup] Build: ${buildId || 'tetiklendi'}`);
}

main().catch((e) => { console.error('[mobile-setup] Hata:', e.message || e); process.exit(1); });