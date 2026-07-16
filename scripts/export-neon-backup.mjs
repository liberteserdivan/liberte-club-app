#!/usr/bin/env node
/**
 * Neon veritabanı tam yedek — yeni projeye taşıma için.
 *
 * Kullanım:
 *   SOURCE_DATABASE_URL=... node scripts/export-neon-backup.mjs
 *   # veya .env içinde SOURCE_DATABASE_URL / DATABASE_URL
 *
 * Çıktı: backups/neon-export-<tarih>.json (gitignore)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql } from './_lib/getSql.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BACKUP_DIR = join(root, 'backups');
const MAX_AUTO_BACKUPS = 20;

// .env dosyasını yükle
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

function getConnectionString() {
  const url = String(
    process.env.SOURCE_DATABASE_URL
    || process.env.DATABASE_URL
    || ''
  ).trim();

  if (!url) {
    console.error('SOURCE_DATABASE_URL veya DATABASE_URL eksik.');
    console.error('Vercel → Settings → Environment Variables → DATABASE_URL (eski proje) kopyalayın.');
    process.exit(1);
  }

  return url;
}

// Tablo varsa satırları oku
async function readTable(sql, tableName) {
  try {
    const rows = await sql(`SELECT * FROM ${tableName}`);
    return rows;
  } catch (error) {
    if (/does not exist/i.test(String(error?.message || ''))) {
      return [];
    }
    throw error;
  }
}

// Yedek dosya adı üret
function buildBackupPath() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return join(BACKUP_DIR, `neon-export-${stamp}.json`);
}

async function main() {
  if (!getConnectionString()) return;

  const sql = getSql('SOURCE_DATABASE_URL');
  if (!sql) {
    console.error('SOURCE_DATABASE_URL veya DATABASE_URL eksik.');
    process.exit(1);
  }

  console.log('Neon yedeği alınıyor…');

  const appState = await readTable(sql, 'app_state');
  const pinAuth = await readTable(sql, 'customer_pin_auth');
  const emails = await readTable(sql, 'customer_emails');
  const sessions = await readTable(sql, 'auth_sessions');

  let backups = await readTable(sql, 'app_state_backups');
  backups = backups
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, MAX_AUTO_BACKUPS);

  const customers = appState[0]?.data?.customers;
  const customerCount = Array.isArray(customers) ? customers.length : 0;

  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    customerCount,
    tables: {
      app_state: appState,
      customer_pin_auth: pinAuth,
      customer_emails: emails,
      auth_sessions: sessions,
      app_state_backups: backups
    }
  };

  mkdirSync(BACKUP_DIR, { recursive: true });
  const outPath = buildBackupPath();
  writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');

  console.log('Yedek tamamlandı.');
  console.log(`  Dosya: ${outPath}`);
  console.log(`  Üye sayısı: ${customerCount}`);
  console.log(`  PIN kayıtları: ${pinAuth.length}`);
  console.log(`  E-posta indeksi: ${emails.length}`);
  console.log(`  Oturumlar: ${sessions.length}`);
  console.log(`  app_state_backups: ${backups.length}`);
  console.log('\nSonraki adım:');
  console.log('  TARGET_DATABASE_URL=<yeni_neon> node scripts/import-neon-backup.mjs', outPath);
}

main().catch((error) => {
  const message = error?.message || String(error);
  console.error('Yedek alınamadı:', message);
  if (/password authentication|connection|ECONNREFUSED|suspended|paused/i.test(message)) {
    console.error('\nProje duraklatılmış olabilir. Neon → Güncelleme (Launch) ile geçici açıp tekrar deneyin.');
  }
  process.exit(1);
});
