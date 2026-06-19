#!/usr/bin/env node
/**
 * Yarım kalmış müşteri kaydını onar
 * Kullanım: node scripts/repair-incomplete-customer.mjs 05515992854
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql } from './_lib/getSql.mjs';
import { cleanPhone } from '../api/_lib/phone.js';
import { repairIncompleteCustomer } from '../api/_lib/customerPhoneRepair.js';
import { findCustomerByPhone } from '../api/_lib/customersStore.js';

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

const phoneArg = process.argv[2] || '05515992854';
const normalized = cleanPhone(phoneArg);
const sql = getSql();

if (!sql) {
  console.error('DATABASE_URL eksik');
  process.exit(1);
}

console.log('Onarım başlıyor:', phoneArg, '→', normalized);

const before = await findCustomerByPhone(sql, phoneArg);
console.log('Önce customers:', before ? `id=${before.id}` : 'YOK');

const repaired = await repairIncompleteCustomer(sql, phoneArg);
console.log('Onarım sonucu:', repaired ? `id=${repaired.id}, email=${repaired.email}` : 'Gerek yok veya başarısız');

const after = await findCustomerByPhone(sql, phoneArg);
console.log('Sonra customers:', after ? `id=${after.id}, phone=${after.phone}` : 'YOK');

await sql.end({ timeout: 5 });
process.exit(after ? 0 : 1);
