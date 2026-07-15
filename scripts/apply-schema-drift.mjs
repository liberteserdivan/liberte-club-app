#!/usr/bin/env node
/** BUG-011/018 apply migrations — does not print secrets */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql } from './_lib/getSql.mjs';
import { describeDatabaseUrl } from '../api/_lib/dbConnection.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(filePath) {
  if (!filePath || !existsSync(filePath)) return;
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
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

for (const name of ['.env', '.env.local']) loadEnvFile(join(root, name));
if (process.env.LIBERTE_ENV_FILE) loadEnvFile(resolve(process.env.LIBERTE_ENV_FILE));

const info = describeDatabaseUrl(process.env.DATABASE_URL || '');
const sql = getSql();
if (!sql) {
  console.error(JSON.stringify({ ok: false, error: 'DATABASE_URL_MISSING' }));
  process.exit(2);
}

console.log(JSON.stringify({ ok: true, step: 'start', provider: info.provider, hostMasked: info.hostMasked }));

const files = [
  'scripts/sql/013_loyalty_events_identity.sql',
  'scripts/sql/014_schema_drift_columns.sql'
];

for (const rel of files) {
  const script = readFileSync(join(root, rel), 'utf8');
  if (rel.includes('013_')) {
    await sql.unsafe(script);
    console.log(JSON.stringify({ ok: true, step: 'applied', file: rel }));
    continue;
  }
  const statements = script
    .split(';')
    .map((s) => s.replace(/--.*$/gm, '').trim())
    .filter((s) => s.length > 10);
  for (const statement of statements) {
    await sql.unsafe(statement);
  }
  console.log(JSON.stringify({ ok: true, step: 'applied', file: rel, count: statements.length }));
}

await sql.end({ timeout: 1 });
console.log(JSON.stringify({ ok: true, step: 'done' }));
