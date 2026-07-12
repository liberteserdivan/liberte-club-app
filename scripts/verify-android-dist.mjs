#!/usr/bin/env node
/**
 * Codemagic — dist icinde v2 istemci bildirim/giris UI metnini dogrular.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const distAssets = join(process.cwd(), 'dist', 'assets');

if (!existsSync(distAssets)) {
  console.error('[verify-android-dist] dist/assets yok — once npm run build:release');
  process.exit(1);
}

const jsFiles = readdirSync(distAssets).filter((name) => name.endsWith('.js'));
const bundle = jsFiles.map((name) => readFileSync(join(distAssets, name), 'utf8')).join('\n');

// v2 istemci imzalari — eski "Ayarlari Ac" metnine bagli kalma
const needles = ['Bildirimleri Aç', 'Otomatik giriş', 'login-auto-restore'];
const missing = needles.filter((needle) => !bundle.includes(needle));

if (missing.length === needles.length) {
  console.error(`[verify-android-dist] v2 UI imzalari dist bundle icinde yok: ${needles.join(', ')}`);
  process.exit(1);
}

const found = needles.filter((needle) => bundle.includes(needle));
console.log(`[verify-android-dist] v2 UI imzalari bulundu: ${found.join(', ')}`);