#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql } from './_lib/getSql.mjs';
import { patchAppStateRegistration } from '../api/_lib/appState.js';
import { loyaltyTemplate } from '../api/_lib/loyaltyOps.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}

const sql = getSql();
const id = Date.now();
const customer = {
  id,
  phone: `555${String(id).slice(-7)}`,
  email: `patch.test.${id}@liberte-test.invalid`,
  name: 'Patch Test',
  isAdmin: false,
  createdAt: new Date().toLocaleString('tr-TR'),
  birthDate: ''
};
const loyaltyEntry = loyaltyTemplate(id);
const historyEntry = {
  id: Date.now(),
  customerId: id,
  name: customer.name,
  phone: customer.phone,
  type: 'register',
  count: 0,
  source: 'patch test',
  createdAt: new Date().toLocaleString('tr-TR')
};

try {
  await patchAppStateRegistration(sql, { customer, loyaltyEntry, historyEntry });
  console.log('patch OK', customer.email);
} catch (error) {
  console.error('patch FAIL', error.message);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}
