#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql } from './_lib/getSql.mjs';
import { cleanPhone } from '../api/_lib/phone.js';

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
const sql = getSql();

const rows = await sql`
  SELECT id, phone, normalized_phone, name, email, is_admin
  FROM customers
  ORDER BY id ASC
`;

const byPhone = new Map();
const byEmail = new Map();

for (const row of rows) {
  const phone = cleanPhone(row.phone || row.normalized_phone || '');
  const email = String(row.email || '').trim().toLowerCase();
  const summary = {
    id: String(row.id),
    name: row.name,
    phone: row.phone,
    email: row.email,
    isAdmin: Boolean(row.is_admin)
  };

  if (phone.length >= 10) {
    if (!byPhone.has(phone)) byPhone.set(phone, []);
    byPhone.get(phone).push(summary);
  }
  if (email) {
    if (!byEmail.has(email)) byEmail.set(email, []);
    byEmail.get(email).push(summary);
  }
}

const duplicatePhones = [...byPhone.entries()]
  .filter(([, list]) => list.length > 1)
  .map(([phone, list]) => ({ phone, count: list.length, rows: list }));

const duplicateEmails = [...byEmail.entries()]
  .filter(([, list]) => list.length > 1)
  .map(([email, list]) => ({ email, count: list.length, rows: list }));

console.log(JSON.stringify({
  ok: true,
  totalCustomers: rows.length,
  duplicatePhoneGroups: duplicatePhones.length,
  duplicateEmailGroups: duplicateEmails.length,
  duplicatePhones,
  duplicateEmails,
  customers: rows.map((row) => ({
    id: String(row.id),
    name: row.name,
    phone: row.phone,
    email: row.email,
    isAdmin: Boolean(row.is_admin)
  }))
}, null, 2));

await sql.end({ timeout: 5 });
