#!/usr/bin/env node
/**
 * customers.normalized_phone alanını doldur ve admin telefonu doğrula
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql } from './_lib/getSql.mjs';
import { cleanPhone } from '../api/_lib/phone.js';
import { grantAdminByPhone } from '../api/_lib/customersStore.js';

const ADMIN_PHONE = '05058665406';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

if (existsSync(join(root, '.env'))) {
  for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    if (!process.env[t.slice(0, eq)]) process.env[t.slice(0, eq)] = t.slice(eq + 1).trim();
  }
}

const sql = getSql();
await sql`ALTER TABLE customers ADD COLUMN IF NOT EXISTS normalized_phone text`;
await sql`CREATE INDEX IF NOT EXISTS idx_customers_normalized_phone ON customers (normalized_phone)`;

const rows = await sql`SELECT id, phone FROM customers`;
let updated = 0;
for (const row of rows) {
  const normalized = cleanPhone(row.phone);
  if (!normalized) continue;
  await sql`
    UPDATE customers
    SET phone = ${normalized}, normalized_phone = ${normalized}, updated_at = now()
    WHERE id = ${Number(row.id)}
  `;
  updated += 1;
}

const admin = await grantAdminByPhone(sql, ADMIN_PHONE);
const check = await sql`
  SELECT id, phone, normalized_phone, is_admin
  FROM customers
  WHERE normalized_phone = ${cleanPhone(ADMIN_PHONE)}
     OR phone = ${cleanPhone(ADMIN_PHONE)}
  LIMIT 1
`;

console.log(JSON.stringify({ ok: true, updated, admin, check: check[0] || null }, null, 2));
await sql.end({ timeout: 5 });
