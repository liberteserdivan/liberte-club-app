#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAppState, saveAppState } from '../api/_lib/appState.js';
import { buildCustomerRecord } from '../api/_lib/auth.js';
import { listCustomers } from '../api/_lib/customerEmails.js';
import { loyaltyTemplate, applyCategoryStamp } from '../api/_lib/loyaltyOps.js';

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

const remote = await loadAppState({ skipPersist: true, skipCache: true });
const state = remote.data;
const phone = '5558608001';
const email = 'e2e.reg.1781888608001@liberte-test.invalid';
const name = 'E2E Test User';

const customer = buildCustomerRecord({ phone, email, name, birthDate: '', isAdmin: false }, listCustomers(state));
const next = {
  ...state,
  customers: [...listCustomers(state), customer],
  loyalty: { ...(state.loyalty || {}), [customer.id]: loyaltyTemplate(customer.id) }
};
applyCategoryStamp(next, customer.id, 'coffee', 2, 'bonus');
next.history = [{
  id: Date.now(),
  customerId: customer.id,
  name,
  phone,
  type: 'register',
  count: 0,
  source: 'test',
  createdAt: new Date().toLocaleString('tr-TR')
}, ...(next.history || [])];

try {
  JSON.stringify(next);
  console.log('JSON.stringify OK');
} catch (error) {
  console.error('stringify fail:', error.message);
  process.exit(1);
}

try {
  await saveAppState(next, { skipBackup: true });
  console.log('saveAppState OK');
} catch (error) {
  console.error('saveAppState FAIL:', error.message);
  process.exit(1);
}
