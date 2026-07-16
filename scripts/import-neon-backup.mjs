#!/usr/bin/env node
/**
 * Neon yedek dosyasını yeni projeye yükler.
 *
 * Kullanım:
 *   TARGET_DATABASE_URL=... node scripts/import-neon-backup.mjs backups/neon-export-....json
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql } from './_lib/getSql.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATE_ID = 'liberte';

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

function getTargetUrl() {
  const url = String(
    process.env.TARGET_DATABASE_URL
    || process.env.DATABASE_URL
    || ''
  ).trim();

  if (!url) {
    console.error('TARGET_DATABASE_URL veya DATABASE_URL eksik (yeni Neon projesi).');
    process.exit(1);
  }

  return url;
}

// Şema tablolarını oluştur
async function ensureSchema(sql) {
  await sql`CREATE TABLE IF NOT EXISTS app_state (
    id text PRIMARY KEY,
    data jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS app_state_backups (
    id bigserial PRIMARY KEY,
    data jsonb NOT NULL,
    reason text NOT NULL DEFAULT 'auto',
    customer_count int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS customer_pin_auth (
    phone text PRIMARY KEY,
    customer_id bigint NOT NULL,
    pin_hash text NOT NULL,
    pin_salt text NOT NULL,
    failed_attempts int NOT NULL DEFAULT 0,
    locked_until timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS customer_emails (
    email text PRIMARY KEY,
    customer_id bigint NOT NULL,
    phone text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS auth_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash text NOT NULL UNIQUE,
    customer_id bigint NOT NULL,
    role text NOT NULL DEFAULT 'user',
    admin_verified boolean NOT NULL DEFAULT false,
    device_id text,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;

  await sql`ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS admin_pin_failed int NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS admin_pin_locked_until timestamptz`;
}

// app_state satırlarını yaz
async function importAppState(sql, rows) {
  for (const row of rows) {
    await sql`
      INSERT INTO app_state (id, data, updated_at)
      VALUES (
        ${row.id || STATE_ID},
        ${JSON.stringify(row.data)}::jsonb,
        ${row.updated_at || new Date().toISOString()}
      )
      ON CONFLICT (id) DO UPDATE SET
        data = EXCLUDED.data,
        updated_at = EXCLUDED.updated_at
    `;
  }
}

// PIN kayıtlarını yaz
async function importPinAuth(sql, rows) {
  for (const row of rows) {
    await sql`
      INSERT INTO customer_pin_auth (
        phone, customer_id, pin_hash, pin_salt, failed_attempts, locked_until, updated_at
      )
      VALUES (
        ${row.phone},
        ${Number(row.customer_id)},
        ${row.pin_hash},
        ${row.pin_salt},
        ${Number(row.failed_attempts || 0)},
        ${row.locked_until || null},
        ${row.updated_at || new Date().toISOString()}
      )
      ON CONFLICT (phone) DO UPDATE SET
        customer_id = EXCLUDED.customer_id,
        pin_hash = EXCLUDED.pin_hash,
        pin_salt = EXCLUDED.pin_salt,
        failed_attempts = EXCLUDED.failed_attempts,
        locked_until = EXCLUDED.locked_until,
        updated_at = EXCLUDED.updated_at
    `;
  }
}

// E-posta indeksini yaz
async function importEmails(sql, rows) {
  for (const row of rows) {
    await sql`
      INSERT INTO customer_emails (email, customer_id, phone, updated_at)
      VALUES (
        ${row.email},
        ${Number(row.customer_id)},
        ${row.phone},
        ${row.updated_at || new Date().toISOString()}
      )
      ON CONFLICT (email) DO UPDATE SET
        customer_id = EXCLUDED.customer_id,
        phone = EXCLUDED.phone,
        updated_at = EXCLUDED.updated_at
    `;
  }
}

// Yedek geçmişini yaz
async function importBackups(sql, rows) {
  for (const row of rows) {
    await sql`
      INSERT INTO app_state_backups (id, data, reason, customer_count, created_at)
      VALUES (
        ${Number(row.id)},
        ${JSON.stringify(row.data)}::jsonb,
        ${row.reason || 'auto'},
        ${Number(row.customer_count || 0)},
        ${row.created_at || new Date().toISOString()}
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }
}

// E-posta indeksini müşteri listesinden oluştur
async function syncEmailsFromState(sql, state) {
  const customers = Array.isArray(state?.customers) ? state.customers : [];
  for (const customer of customers) {
    const email = String(customer.email || '').trim().toLowerCase();
    if (!email || !customer.id) continue;
    await sql`
      INSERT INTO customer_emails (email, customer_id, phone, updated_at)
      VALUES (${email}, ${Number(customer.id)}, ${String(customer.phone || '')}, now())
      ON CONFLICT (email) DO UPDATE SET
        customer_id = EXCLUDED.customer_id,
        phone = EXCLUDED.phone,
        updated_at = now()
    `;
  }
}

// Uygulama yedeği mi (admin panel export)?
function parseAppBackup(payload) {
  if (payload?.data && Array.isArray(payload.data.customers)) {
    return {
      exportedAt: payload.exportedAt,
      customerCount: payload.data.customers.length,
      appStateRows: [{
        id: STATE_ID,
        data: payload.data,
        updated_at: payload.updatedAt || new Date().toISOString()
      }],
      tables: null
    };
  }
  return null;
}

async function main() {
  const backupPath = process.argv[2];
  if (!backupPath || !existsSync(backupPath)) {
    console.error('Kullanım: node scripts/import-neon-backup.mjs <yedek.json>');
    console.error('  Uygulama yedeği: liberte-yedek-*.json veya liberte-onbellek-yedek-*.json');
    process.exit(1);
  }

  const dryRun = process.argv.includes('--dry-run');
  const payload = JSON.parse(readFileSync(backupPath, 'utf8'));
  const appBackup = parseAppBackup(payload);
  const tables = appBackup?.tables ?? payload.tables ?? {};

  if (!appBackup && !tables.app_state?.length) {
    console.error('Yedekte app_state veya data.customers bulunamadı.');
    process.exit(1);
  }

  const appStateRows = appBackup?.appStateRows ?? tables.app_state;
  const customerCount = appBackup?.customerCount ?? payload.customerCount ?? appStateRows[0]?.data?.customers?.length;

  console.log(`Yedek: ${backupPath}`);
  console.log(`  Tür: ${appBackup ? 'uygulama-export' : 'neon-export'}`);
  console.log(`  Tarih: ${payload.exportedAt || '?'}`);
  console.log(`  Üye: ${customerCount ?? '?'}`);

  if (dryRun) {
    console.log('DRY-RUN: veri yazılmadı.');
    return;
  }

  const sql = getSql('TARGET_DATABASE_URL');
  if (!sql) {
    console.error('TARGET_DATABASE_URL veya DATABASE_URL eksik (yeni Neon projesi).');
    process.exit(1);
  }
  await ensureSchema(sql);

  await importAppState(sql, appStateRows);

  if (appBackup) {
    await syncEmailsFromState(sql, appStateRows[0].data);
    console.log('Not: PIN kayıtları bu yedekte yok — üyeler PIN sıfırlama kullanabilir.');
  } else {
    await importPinAuth(sql, tables.customer_pin_auth || []);
    await importEmails(sql, tables.customer_emails || []);
    await importBackups(sql, tables.app_state_backups || []);
  }

  const verify = await sql`SELECT id, updated_at FROM app_state WHERE id = ${STATE_ID} LIMIT 1`;
  if (!verify.length) {
    console.error('Doğrulama başarısız: app_state yok.');
    process.exit(1);
  }

  console.log('İçe aktarma tamamlandı.');
  console.log('Sonraki adımlar:');
  console.log('  1. Vercel → DATABASE_URL → yeni Postgres connection string (Supabase vb.)');
  console.log('  2. Vercel redeploy');
  console.log('  3. Uygulamada giriş testi');
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
