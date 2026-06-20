#!/usr/bin/env node
/**
 * Production DB'de jwt_secret erişilebilir mi kontrol — değer loglanmaz
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql } from './_lib/getSql.mjs';

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

const sql = getSql();
if (!sql) {
  console.log('hasDatabaseUrl: false');
  process.exit(1);
}

try {
  const rows = await sql`SELECT current_setting('app.settings.jwt_secret', true) AS jwt`;
  const has = Boolean(rows[0]?.jwt);
  console.log('app.settings.jwt_secret_available:', has);
} catch (error) {
  console.log('app.settings.jwt_secret_available: false');
  console.log('reason:', error?.message?.slice(0, 120));
}

process.exit(0);
