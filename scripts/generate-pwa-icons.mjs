import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { BRAND_FOREST_RGB } from './iconBrand.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'public', 'liberte-logo.png');

// Şeffaf logoyu koyu yeşil zemin üzerine yerleştir
async function buildSquareIcon(size, dest, paddingRatio = 0.11) {
  const padding = Math.max(2, Math.round(size * paddingRatio));
  const inner = size - padding * 2;

  const logoBuf = await sharp(source)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: BRAND_FOREST_RGB
    }
  })
    .composite([{ input: logoBuf, gravity: 'center' }])
    .png({ compressionLevel: 9, force: true })
    .toFile(dest);
}

async function main() {
  const targets = [
    ['public/icon-192.png', 192],
    ['public/icon-512.png', 512],
    ['public/apple-touch-icon.png', 180],
    ['public/favicon-32.png', 32],
    ['public/favicon-16.png', 16]
  ];

  for (const [relPath, size] of targets) {
    const dest = join(root, relPath);
    await buildSquareIcon(size, dest);
    console.log(`${relPath} (${size}px, şeffaf logo + yeşil zemin)`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
