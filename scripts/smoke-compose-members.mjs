#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();
process.env.USE_RELATIONAL_STATE = process.env.USE_RELATIONAL_STATE || '1';

const { composeStateFromRelational } = await import('../api/_lib/relationalState.js');
const { getSql } = await import('../api/_lib/appState.js');

const composed = await composeStateFromRelational();
const customers = composed.data?.customers || [];

console.log(JSON.stringify({
  ok: customers.length > 0,
  customerCount: customers.length,
  sample: customers.slice(0, 3).map((c) => ({ id: c.id, name: c.name, phone: c.phone }))
}, null, 2));

const sql = getSql();
if (sql?.end) await sql.end({ timeout: 5 });

if (!customers.length) process.exit(2);
