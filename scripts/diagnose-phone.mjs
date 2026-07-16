/**
 * Belirli telefon numarasını tüm tablolarda ara — kayıt/giriş çelişkisi teşhisi
 * Kullanım: node scripts/diagnose-phone.mjs 05515992854
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { cleanPhone, phoneLookupVariants } from '../api/_lib/phone.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Yerel .env yükle
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
const variants = phoneLookupVariants(phoneArg);

const url = process.env.DATABASE_URL || process.env.TARGET_DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL eksik');
  process.exit(1);
}

const sql = postgres(url, { ssl: 'require', max: 1, prepare: false });

async function safeQuery(label, query) {
  try {
    const rows = await query;
    console.log(`\n=== ${label} (${rows.length}) ===`);
    for (const row of rows) {
      console.log(JSON.stringify(row, null, 0));
    }
    return rows;
  } catch (e) {
    console.log(`\n=== ${label} — HATA: ${e.message} ===`);
    return [];
  }
}

console.log('Telefon:', phoneArg);
console.log('Normalize:', normalized);
console.log('Varyantlar:', variants.join(', '));

await safeQuery('customers', sql`
  SELECT id, phone, normalized_phone, email, name, is_admin, created_at
  FROM customers
  WHERE normalized_phone = ${normalized}
     OR phone = ANY(${variants})
`);

await safeQuery('customer_emails', sql`
  SELECT email, customer_id, phone, updated_at
  FROM customer_emails
  WHERE phone = ANY(${variants}) OR phone = ${normalized}
`);

await safeQuery('customer_pin_auth', sql`
  SELECT phone, customer_id, failed_attempts, locked_until, updated_at
  FROM customer_pin_auth
  WHERE phone = ANY(${variants}) OR phone = ${normalized}
`);

await safeQuery('auth_sessions (aktif)', sql`
  SELECT s.id, s.customer_id, s.role, s.expires_at, c.phone
  FROM auth_sessions s
  LEFT JOIN customers c ON c.id = s.customer_id
  WHERE c.normalized_phone = ${normalized}
     OR c.phone = ANY(${variants})
     OR s.customer_id IN (
       SELECT customer_id FROM customer_emails WHERE phone = ANY(${variants})
     )
  ORDER BY s.expires_at DESC
  LIMIT 5
`);

await safeQuery('customer_loyalty', sql`
  SELECT cl.customer_id, cl.lp_balance, cl.level, c.phone
  FROM customer_loyalty cl
  LEFT JOIN customers c ON c.id = cl.customer_id
  WHERE c.normalized_phone = ${normalized}
     OR c.phone = ANY(${variants})
     OR cl.customer_id IN (
       SELECT customer_id FROM customer_emails WHERE phone = ANY(${variants})
     )
`);

await safeQuery('email_codes', sql`
  SELECT email, phone, purpose, used_at, expires_at, created_at
  FROM email_codes
  WHERE phone = ANY(${variants}) OR phone = ${normalized}
  ORDER BY created_at DESC
  LIMIT 10
`);

// app_state içinde eski kayıt
const stateRows = await safeQuery('app_state customers', sql`
  SELECT id, data
  FROM app_state
  WHERE id = 'liberte'
  LIMIT 1
`);

if (stateRows[0]?.data?.customers) {
  const customers = stateRows[0].data.customers;
  const list = Array.isArray(customers) ? customers : Object.values(customers);
  const matches = list.filter((c) => cleanPhone(c?.phone) === normalized);
  console.log(`\n=== app_state eşleşme (${matches.length}) ===`);
  for (const m of matches) {
    console.log(JSON.stringify({ id: m.id, phone: m.phone, email: m.email, name: m.name }, null, 0));
  }
}

await sql.end();
