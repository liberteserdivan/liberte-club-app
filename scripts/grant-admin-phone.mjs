#!/usr/bin/env node
/**
 * Belirtilen telefona admin yetkisi verir (normalize customers tablosu + aktif oturumlar).
 *
 * Kullanım:
 *   DATABASE_URL=... node scripts/grant-admin-phone.mjs 05058665406
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql } from './_lib/getSql.mjs';
import { cleanPhone } from '../api/_lib/phone.js';
import { grantAdminByPhone } from '../api/_lib/customersStore.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Yerel .env dosyasını yükle
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

const phoneArg = process.argv[2] || '05058665406';
const normalized = cleanPhone(phoneArg);

async function main() {
  loadEnv();
  const sql = getSql();
  if (!sql) {
    console.error('DATABASE_URL tanımlı değil.');
    process.exit(1);
  }

  try {
    const customer = await grantAdminByPhone(sql, normalized);
    if (!customer) {
      console.error('Admin atanamadı — telefon geçersiz:', phoneArg);
      process.exit(1);
    }

    console.log(JSON.stringify({
      ok: true,
      phone: normalized,
      customerId: customer.id,
      isAdmin: customer.isAdmin,
      message: 'Admin yetkisi verildi. Kullanıcı yeniden giriş yapmalı veya oturum yenilenmeli.'
    }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
