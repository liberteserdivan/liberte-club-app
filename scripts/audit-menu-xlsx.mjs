import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const xlsx = process.argv[2] || path.join(process.env.USERPROFILE, 'Downloads', 'Liberte Gastro Cafe_urunler_2026-06-05.xlsx');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmp = path.join(__dirname, '..', '.tmp-audit');

function readRows(filePath) {
  fs.mkdirSync(tmp, { recursive: true });
  fs.copyFileSync(filePath, path.join(tmp, 'm.zip'));
  execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${path.join(tmp, 'm.zip').replace(/'/g, "''")}' -DestinationPath '${path.join(tmp, 'x').replace(/'/g, "''")}' -Force"`, { stdio: 'pipe' });
  const sst = fs.readFileSync(path.join(tmp, 'x', 'xl', 'sharedStrings.xml'), 'utf8');
  const sheet = fs.readFileSync(path.join(tmp, 'x', 'xl', 'worksheets', 'sheet1.xml'), 'utf8');
  const strings = [...sst.matchAll(/<si>(?:<t[^>]*>([^<]*)<\/t>|<r><t[^>]*>([^<]*)<\/t>)/g)].map((m) => m[1] ?? m[2] ?? '');
  const colIndex = (ref) => ref.replace(/\d+/g, '').split('').reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
  const rows = new Map();
  for (const cell of sheet.matchAll(/<c r="([A-Z]+\d+)"([^>]*)><v>([^<]*)<\/v><\/c>/g)) {
    const [, ref, attrs, raw] = cell;
    const rn = Number(ref.replace(/\D+/g, ''));
    if (rn < 2) continue;
    const col = colIndex(ref);
    const v = attrs.includes('t="s"') ? (strings[Number(raw)] ?? '') : Number(raw);
    if (!rows.has(rn)) rows.set(rn, []);
    rows.get(rn)[col] = v;
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  return [...rows.values()];
}

const rows = readRows(xlsx);
const unavailable = rows.filter((c) => c[7] === 'Mevcut Değil');
const available = rows.filter((c) => c[1] && c[3] && c[7] !== 'Mevcut Değil');
console.log('Excel urun satiri:', rows.length);
console.log('Mevcut:', available.length);
console.log('Mevcut degil (import disi):', unavailable.length);
console.log('Mevcut degil liste:', unavailable.map((c) => c[1]).join(' | '));
