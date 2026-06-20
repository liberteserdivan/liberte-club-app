#!/usr/bin/env node
/**
 * JWT secret varlık kontrolü — değer ASLA loglanmaz
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql } from './_lib/getSql.mjs';
import { deriveSupabaseProjectRef } from '../api/_lib/supabasePublicConfig.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(name) {
  const envPath = join(root, name);
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

loadEnvFile('.env');
loadEnvFile('.env.vercel.tmp');

let hasLocal = Boolean(String(process.env.SUPABASE_JWT_SECRET || '').trim());
let hasSqlSetting = false;

const sql = getSql();
if (sql) {
  try {
    const rows = await sql`SELECT current_setting('app.settings.jwt_secret', true) IS NOT NULL AS present`;
    hasSqlSetting = Boolean(rows[0]?.present);
  } catch {
    hasSqlSetting = false;
  }
}

const projectRef = deriveSupabaseProjectRef(process.env.DATABASE_URL);
console.log(JSON.stringify({
  hasLocalJwtSecret: hasLocal,
  hasSqlJwtSetting: hasSqlSetting,
  projectRef: projectRef || null
}));
