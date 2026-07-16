#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql } from './_lib/getSql.mjs';
import { parseAppStateData } from '../api/_lib/appState.js';
import { estimateStateSizeMb } from '../api/_lib/relationalState.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    if (!process.env[t.slice(0, eq)]) process.env[t.slice(0, eq)] = t.slice(eq + 1).trim();
  }
}

const sql = getSql();
const stateRow = await sql`SELECT data, pg_column_size(data) AS bytes, updated_at FROM app_state WHERE id = 'liberte' LIMIT 1`;
const slim = parseAppStateData(stateRow[0]?.data);

const counts = await sql`
  SELECT
    (SELECT count(*)::int FROM customers) AS customers,
    (SELECT count(*)::int FROM customer_emails) AS customer_emails,
    (SELECT count(*)::int FROM customer_pin_auth) AS customer_pin_auth,
    (SELECT count(*)::int FROM customer_loyalty) AS customer_loyalty,
    (SELECT count(*)::int FROM loyalty_events) AS loyalty_events,
    (SELECT count(*)::int FROM menu_categories) AS menu_categories,
    (SELECT count(*)::int FROM menu_items) AS menu_items,
    (SELECT count(*)::int FROM coupons) AS coupons,
    (SELECT count(*)::int FROM coupon_uses) AS coupon_uses,
    (SELECT count(*)::int FROM campaigns) AS campaigns,
    (SELECT count(*)::int FROM daily_campaigns) AS daily_campaigns,
    (SELECT count(*)::int FROM auth_sessions) AS auth_sessions
`;

const admin = await sql`SELECT id, phone, name, is_admin FROM customers WHERE phone = '5058665406' LIMIT 1`;
const pin = await sql`SELECT customer_id FROM customer_pin_auth WHERE phone = '5058665406' LIMIT 1`;
const sess = await sql`
  SELECT role, admin_verified FROM auth_sessions
  WHERE customer_id = ${admin[0]?.id || 0}
  ORDER BY created_at DESC LIMIT 1
`;

console.log(JSON.stringify({
  appState: {
    beforeMb: 49.42,
    currentMb: estimateStateSizeMb(slim),
    bytes: Number(stateRow[0]?.bytes || 0),
    updatedAt: stateRow[0]?.updated_at,
    relationalInBlob: {
      customers: slim?.customers?.length || 0,
      categories: slim?.categories?.length || 0,
      items: slim?.items?.length || 0,
      loyaltyKeys: slim?.loyalty ? Object.keys(slim.loyalty).length : 0,
      history: slim?.history?.length || 0
    },
    globalInBlob: {
      coupons: slim?.coupons?.length || 0,
      campaigns: slim?.campaigns?.length || 0,
      keys: Object.keys(slim || {})
    }
  },
  tables: counts[0],
  admin: { customer: admin[0] || null, hasPin: Boolean(pin[0]), session: sess[0] || null }
}, null, 2));

await sql.end({ timeout: 5 });
