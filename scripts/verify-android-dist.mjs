#!/usr/bin/env node
/**
 * Codemagic — dist icinde bildirim UI metnini dogrular (UTF-8 guvenli).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const distAssets = join(process.cwd(), 'dist', 'assets');

if (!existsSync(distAssets)) {
  console.error('[verify-android-dist] dist/assets yok — once npm run build:release');
  process.exit(1);
}

const jsFiles = readdirSync(distAssets).filter((name) => name.endsWith('.js'));
const needle = 'Ayarları Aç';
const found = jsFiles.some((name) => readFileSync(join(distAssets, name), 'utf8').includes(needle));

if (!found) {
  console.error(`[verify-android-dist] "${needle}" dist bundle icinde bulunamadi`);
  process.exit(1);
}

console.log('[verify-android-dist] bildirim UI metni dist icinde bulundu');
