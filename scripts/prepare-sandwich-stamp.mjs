import sharp from 'sharp';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const sourcePath = join(root, 'public', 'stamps', 'sandwich-source.png');
const outPath = join(root, 'public', 'stamps', 'sandwich.png');

// Liberte hero mint tonu
const STAMP_BG = { r: 196, g: 214, b: 206, alpha: 1 };

if (!existsSync(sourcePath)) {
  console.error('sandwich-source.png bulunamadı.');
  process.exit(1);
}

mkdirSync(dirname(outPath), { recursive: true });

const meta = await sharp(sourcePath).metadata();
const width = meta.width || 681;
const height = meta.height || 1024;

// Dikey hero — sandviç+tabak ortada, alt metin kesilir
const cropSize = Math.min(width, height);
const left = Math.max(0, Math.round((width - cropSize) / 2));
const top = Math.max(0, Math.round((height - cropSize) * 0.38));

await sharp(sourcePath)
  .extract({ left, top, width: cropSize, height: cropSize })
  .resize(640, 640, {
    fit: 'contain',
    background: STAMP_BG
  })
  .png({ compressionLevel: 8 })
  .toFile(outPath);

console.log('✓ Liberte sandviç damgası güncellendi → public/stamps/sandwich.png');
