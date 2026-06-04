import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outDir = join(root, 'public', 'stamps');

const assetsDir = process.env.STAMP_ASSETS_DIR || join(
  process.env.APPDATA || '',
  'Cursor',
  'User',
  'workspaceStorage',
  'b56f0152ddc44725a503c2eadc0f5345',
  'images'
);

// Ürün zoom — arka plan minimum, ürün maksimum
const STAMPS = [
  {
    id: 'dessert',
    file: 'WhatsApp Image 2026-06-04 at 23.33.29 (1)-f78e079b-a534-435a-abbf-5a600ec40d91.png',
    topRatio: 0.27,
    zoom: 0.58,
    focusY: 0.74
  },
  {
    id: 'coffee',
    file: 'WhatsApp Image 2026-06-04 at 23.33.29-c3617f99-69ba-4bc0-b597-3c9e35d0978a.png',
    topRatio: 0.17,
    zoom: 0.54,
    focusY: 0.5
  },
  {
    id: 'burger',
    file: 'WhatsApp Image 2026-06-04 at 23.33.28-49484abb-7b5c-47e9-964e-0a91062422c9.png',
    topRatio: 0.25,
    zoom: 0.56,
    focusY: 0.7
  }
];

// Kare kırp + ürün bölgesine zoom
async function buildStampImage(inputPath, { topRatio, zoom, focusY }) {
  const meta = await sharp(inputPath).metadata();
  const size = meta.width;
  const footerReserve = Math.round(meta.height * 0.1);
  const maxTop = Math.max(0, meta.height - footerReserve - size);
  const top = Math.min(Math.round(meta.height * topRatio), maxTop);

  const square = await sharp(inputPath)
    .extract({ left: 0, top, width: size, height: size })
    .toBuffer();

  const inner = Math.round(size * zoom);
  const innerLeft = Math.round((size - inner) / 2);
  const innerTop = Math.round((size - inner) * focusY);

  return sharp(square)
    .extract({ left: innerLeft, top: innerTop, width: inner, height: inner })
    .resize(640, 640, { fit: 'fill' })
    .normalize()
    .modulate({ brightness: 1.03, saturation: 1.26 })
    .sharpen({ sigma: 1.7, m1: 1, m2: 0.6 })
    .png({ compressionLevel: 8 })
    .toBuffer();
}

mkdirSync(outDir, { recursive: true });

for (const stamp of STAMPS) {
  const input = join(assetsDir, stamp.file);
  const output = join(outDir, `${stamp.id}.png`);
  const buffer = await buildStampImage(input, stamp);
  await sharp(buffer).toFile(output);
  console.log(`✓ ${stamp.id} → public/stamps/${stamp.id}.png`);
}
