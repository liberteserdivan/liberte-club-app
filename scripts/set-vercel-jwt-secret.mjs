#!/usr/bin/env node
/**
 * Supabase vault / postgrest üzerinden JWT secret al ve Vercel'e ekle — değer loglanmaz
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
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

// Kaynaklardan JWT secret oku — hiçbir yerde loglanmaz
async function resolveJwtSecret() {
  const fromEnv = String(process.env.SUPABASE_JWT_SECRET || '').trim();
  if (fromEnv) return fromEnv;

  const sql = getSql();
  if (sql) {
    try {
      const rows = await sql`SELECT current_setting('app.settings.jwt_secret', true) AS v`;
      const v = String(rows[0]?.v || '').trim();
      if (v) return v;
    } catch {
      // SQL ayarı yok
    }

    try {
      const vault = await sql`
        SELECT decrypted_secret AS v
        FROM vault.decrypted_secrets
        WHERE name ILIKE '%jwt%'
        LIMIT 1
      `;
      const v = String(vault[0]?.v || '').trim();
      if (v) return v;
    } catch {
      // vault erişimi yok
    }
  }

  const token = String(process.env.SUPABASE_ACCESS_TOKEN || '').trim();
  const ref = deriveSupabaseProjectRef(process.env.DATABASE_URL);
  if (token && ref) {
    try {
      const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/postgrest`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15000)
      });
      if (res.ok) {
        const data = await res.json();
        const v = String(data?.jwt_secret || '').trim();
        if (v) return v;
      }
    } catch {
      // API erişimi yok
    }
  }

  return null;
}

const secret = await resolveJwtSecret();
if (!secret) {
  console.error('JWT secret bulunamadı.');
  console.error('Çözüm: Supabase Dashboard → Project Settings → API → JWT Secret');
  console.error('Değeri .env dosyasına SUPABASE_JWT_SECRET=... olarak ekleyin, sonra tekrar çalıştırın.');
  console.error('Alternatif: SUPABASE_ACCESS_TOKEN env ile Management API erişimi.');
  process.exit(1);
}

console.log('Vercel Production: SUPABASE_JWT_SECRET ekleniyor (değer loglanmaz)...');

const result = spawnSync(
  'npx',
  ['vercel', 'env', 'add', 'SUPABASE_JWT_SECRET', 'production', '--force'],
  {
    cwd: root,
    input: secret,
    encoding: 'utf8',
    shell: true,
    stdio: ['pipe', 'pipe', 'pipe']
  }
);

if (result.status !== 0) {
  console.error('Vercel env ekleme başarısız.');
  if (result.stderr) {
    console.error(String(result.stderr).replaceAll(secret, '[REDACTED]'));
  }
  process.exit(1);
}

console.log('OK — SUPABASE_JWT_SECRET production ortamına eklendi.');
console.log('hasSupabaseJwtSecret: true');
