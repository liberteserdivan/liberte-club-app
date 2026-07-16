#!/usr/bin/env node
/**
 * Boş Postgres/Supabase üzerinde Liberte şemasını oluşturur.
 *
 * Kullanım:
 *   DATABASE_URL=... npm run db:init
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql } from './_lib/getSql.mjs';

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

  await sql`CREATE TABLE IF NOT EXISTS email_codes (
    id bigserial PRIMARY KEY,
    email text NOT NULL,
    phone text NOT NULL,
    code text NOT NULL,
    attempts int NOT NULL DEFAULT 0,
    used boolean NOT NULL DEFAULT false,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS app_error_logs (
    id bigserial PRIMARY KEY,
    level text NOT NULL DEFAULT 'error',
    source text NOT NULL,
    message text NOT NULL,
    code text,
    detail jsonb,
    customer_id bigint,
    platform text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;

  await sql`CREATE INDEX IF NOT EXISTS app_error_logs_created_at_idx ON app_error_logs (created_at DESC)`;

  await sql`CREATE TABLE IF NOT EXISTS auth_rate_limits (
    rate_key text PRIMARY KEY,
    hit_count int NOT NULL DEFAULT 0,
    window_start timestamptz NOT NULL DEFAULT now()
  )`;
}

loadLocalEnv();

const sql = getSql();
if (!sql) {
  console.error('DATABASE_URL eksik.');
  process.exit(1);
}

try {
  await ensureSchema(sql);
  console.log('Şema hazır.');
} finally {
  await sql.end({ timeout: 5 });
}
