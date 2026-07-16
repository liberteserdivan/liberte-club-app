import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Kullanım: node scripts/minify-service-account.mjs indirilen-key.json');
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = readFileSync(inputPath, 'utf8');
const json = JSON.parse(raw);
const oneLine = JSON.stringify(json);
const base64 = Buffer.from(oneLine, 'utf8').toString('base64');

writeFileSync(join(root, 'service-account.oneline.txt'), oneLine, 'utf8');
writeFileSync(join(root, 'service-account.base64.txt'), base64, 'utf8');

console.log('Oluşturuldu:');
console.log('- service-account.oneline.txt  → Vercel FIREBASE_SERVICE_ACCOUNT_JSON');
console.log('- service-account.base64.txt   → alternatif (base64)');
