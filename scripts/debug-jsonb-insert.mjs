#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAppState } from '../api/_lib/appState.js';
import { getSql } from '../scripts/_lib/getSql.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
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

const remote = await loadAppState({ skipPersist: true, skipCache: true });
const data = remote.data;
const sql = getSql();
const serialized = JSON.stringify(data);

console.log('payload bytes:', serialized.length);

const methods = [
  ['sql.json(data)', async () => {
    await sql`INSERT INTO app_state (id, data) VALUES (${'json-probe-1'}, ${sql.json(data)}) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`;
  }],
  ['sql.json(parsed)', async () => {
    await sql`INSERT INTO app_state (id, data) VALUES (${'json-probe-2'}, ${sql.json(JSON.parse(serialized))}) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`;
  }],
  ['string param', async () => {
    await sql`INSERT INTO app_state (id, data) VALUES (${'json-probe-3'}, ${serialized}) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`;
  }]
];

for (const [name, fn] of methods) {
  try {
    await fn();
    console.log(name, 'OK');
  } catch (error) {
    console.log(name, 'FAIL', error.message);
  }
}

await sql`DELETE FROM app_state WHERE id LIKE 'json-probe-%'`;

await sql.end({ timeout: 5 });
