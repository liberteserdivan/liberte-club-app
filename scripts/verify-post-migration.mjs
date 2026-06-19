#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql } from './_lib/getSql.mjs';
import { parseAppStateData } from '../api/_lib/appState.js';
import { estimateStateSizeMb } from '../api/_lib/relationalState.js';

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

const [stateRow, adminRow] = await Promise.all([
  sql`SELECT data FROM app_state WHERE id = 'liberte' LIMIT 1`,
  sql`SELECT id, phone, name, is_admin FROM customers WHERE phone = '5058665406' LIMIT 1`
]);

const slim = parseAppStateData(stateRow[0]?.data);
const counts = await sql`
  SELECT
    (SELECT count(*)::int FROM customers) AS customers,
    (SELECT count(*)::int FROM customer_emails) AS emails,
    (SELECT count(*)::int FROM customer_loyalty) AS loyalty,
    (SELECT count(*)::int FROM loyalty_events) AS events,
    (SELECT count(*)::int FROM menu_categories) AS categories,
    (SELECT count(*)::int FROM menu_items) AS items
`;

console.log(JSON.stringify({
  ok: true,
  appStateMb: estimateStateSizeMb(slim),
  globalKeys: Object.keys(slim || {}),
  hasCustomersInBlob: Boolean(slim?.customers?.length),
  hasMenuInBlob: Boolean(slim?.categories?.length || slim?.items?.length),
  admin: adminRow[0] || null,
  tableCounts: counts[0]
}, null, 2));

await sql.end({ timeout: 5 });
