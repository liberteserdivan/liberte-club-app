#!/usr/bin/env node
/**
 * CapApp-SPM Package.swift — Windows backslash yollarini macOS slash'a cevirir.
 * cap sync sonrasi Codemagic ve lokal iOS build oncesi calistirilir.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'ios',
  'App',
  'CapApp-SPM',
  'Package.swift'
);

let content = readFileSync(pkgPath, 'utf8');
const normalized = content.replace(/\\(?=[/\\@])/g, '/').replace(/\\/g, '/');

if (content !== normalized) {
  writeFileSync(pkgPath, normalized, 'utf8');
  console.log('[spm-paths] Package.swift yollari duzeltildi.');
} else {
  console.log('[spm-paths] Package.swift yollari zaten uyumlu.');
}
