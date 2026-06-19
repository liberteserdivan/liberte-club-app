#!/usr/bin/env node
/**
 * Slim sonrası kaybolan global ayarları yedekten geri yükler.
 * Kullanım: node scripts/repair-slim-app-state.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql } from './_lib/getSql.mjs';
import { parseAppStateData, serializeAppStateJson } from '../api/_lib/appState.js';
import { buildSlimGlobalState, estimateStateSizeMb } from '../api/_lib/relationalState.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
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

loadEnv();
const sql = getSql();

const latest = await sql`
  SELECT data FROM app_state_backups
  ORDER BY created_at DESC
  LIMIT 1
`;

const full = parseAppStateData(latest[0]?.data);
if (!full?.settings) {
  console.error('Yedekte settings bulunamadı.');
  process.exit(1);
}

const slim = buildSlimGlobalState(full);

await sql`
  INSERT INTO app_state (id, data, updated_at)
  VALUES ('liberte', ${serializeAppStateJson(slim)}, now())
  ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
`;

console.log(JSON.stringify({
  ok: true,
  restoredKeys: Object.keys(slim),
  sizeMb: estimateStateSizeMb(slim),
  hasSettings: Boolean(slim.settings)
}, null, 2));

await sql.end({ timeout: 5 });
