#!/usr/bin/env node
/**
 * Tani paketi staging — git ile izlenen (secret'siz) tum dosyalari + diagnostics/
 * klasorunu audit-export/liberte-club-src altina kopyalar. Zip adimi ayri (PowerShell).
 * Salt-okunur tani amaclidir; production verisine dokunmaz.
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, rmSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const staging = join(root, 'audit-export', 'liberte-club-src');

// Gercek deger icermesi mumkun olmayan ornek/sablon disinda guvenli; yine de
// hassas desenleri tamamen disla (savunma amacli — bunlar zaten izlenmiyor).
const EXCLUDE = /(^|\/)\.env($|\.)|google-services\.json$|GoogleService-Info\.plist$|\.keystore$|\.jks$/i;

function copyTrackedFiles() {
  const out = execSync('git ls-files', { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const files = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  let copied = 0;
  let skipped = 0;
  for (const rel of files) {
    if (EXCLUDE.test(rel)) { skipped += 1; continue; }
    const src = join(root, rel);
    if (!existsSync(src)) { continue; }
    const dest = join(staging, rel);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    copied += 1;
  }
  return { copied, skipped };
}

function copyDir(srcDir, destDir) {
  mkdirSync(destDir, { recursive: true });
  for (const entry of readdirSync(srcDir)) {
    const s = join(srcDir, entry);
    const d = join(destDir, entry);
    if (statSync(s).isDirectory()) copyDir(s, d);
    else copyFileSync(s, d);
  }
}

// Temizle ve yeniden olustur
rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });

const { copied, skipped } = copyTrackedFiles();

// diagnostics klasorunu da pakete koy
const diagSrc = join(root, 'diagnostics');
if (existsSync(diagSrc)) copyDir(diagSrc, join(staging, 'diagnostics'));

console.log(`Staging hazir: ${staging}`);
console.log(`Kopyalanan izlenen dosya: ${copied}, atlanan (hassas desen): ${skipped}`);
