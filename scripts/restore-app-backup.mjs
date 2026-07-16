#!/usr/bin/env node
/**
 * Uygulama yedeğini yeni Neon projesine yükler — tek komut.
 *
 * Kullanım:
 *   TARGET_DATABASE_URL=... node scripts/restore-app-backup.mjs "C:\path\liberte-yedek.json"
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const backupPath = process.argv[2];
if (!backupPath || !existsSync(backupPath)) {
  console.error('Kullanım: node scripts/restore-app-backup.mjs <yedek.json>');
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const importScript = join(root, 'import-neon-backup.mjs');

const result = spawnSync(process.execPath, [importScript, backupPath], {
  stdio: 'inherit',
  env: process.env
});

process.exit(result.status ?? 1);
