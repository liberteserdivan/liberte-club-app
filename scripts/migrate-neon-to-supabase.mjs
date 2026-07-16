#!/usr/bin/env node
/**
 * Neon JSON yedeğini Supabase PostgreSQL'e aktarır (opsiyonel).
 *
 * Kullanım:
 *   TARGET_DATABASE_URL=... node scripts/migrate-neon-to-supabase.mjs backups/neon-export-....json
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const backupPath = process.argv[2];
if (!backupPath || !existsSync(backupPath)) {
  console.error('Kullanım: node scripts/migrate-neon-to-supabase.mjs <yedek.json>');
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const importScript = join(root, 'import-neon-backup.mjs');

console.log('Neon → Supabase import (import-neon-backup.mjs delegasyonu)…');

const result = spawnSync(process.execPath, [importScript, backupPath], {
  stdio: 'inherit',
  env: process.env
});

process.exit(result.status ?? 1);
