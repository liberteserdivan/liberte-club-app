#!/usr/bin/env node
/**
 * Codemagic build adımlarını (buildActions) ve isteğe bağlı log özetini yazdırır.
 * Kullanım: node scripts/dump-codemagic-actions.mjs <buildId> [logAraKelime]
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

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
const buildId = process.argv[2];
const grep = String(process.argv[3] || '').toLowerCase();

if (!token || !buildId) {
  console.error('Kullanım: node scripts/dump-codemagic-actions.mjs <buildId> [logAraKelime]');
  process.exit(1);
}

const response = await fetch(`https://api.codemagic.io/builds/${buildId}`, {
  headers: { 'x-auth-token': token }
});
const payload = await response.json();
const build = payload.build || payload;

const actions = Array.isArray(build.buildActions) ? build.buildActions : [];
for (const action of actions) {
  console.log(`STEP: ${action.name || action.type} -> ${action.status}`);
}

// Yayın (publishing) durumunu yazdır
if (build.publishing || build.publishers) {
  console.log('PUBLISHING:', JSON.stringify(build.publishing || build.publishers));
}

// İstenen kelimeyi içeren adımın logunu indir ve eşleşen satırları göster
if (grep) {
  const target = actions.find((a) => String(a.name || a.type || '').toLowerCase().includes(grep));
  const logUrl = target?.logUrl || target?.log_url;
  if (!logUrl) {
    console.log(`LOG: "${grep}" adımı için logUrl bulunamadı`);
  } else {
    const logRes = await fetch(logUrl, { headers: { 'x-auth-token': token } });
    const logText = await logRes.text();
    const lines = logText.split('\n').filter((l) => /play|track|yukle|tamamland|basarisiz|version|aab|error/i.test(l));
    console.log('--- LOG OZET ---');
    console.log(lines.slice(-40).join('\n'));
  }
}
