import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { BRAND_CREAM_RGB } from './iconBrand.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// Tam rozet (beyaz daire içi) — krem zemin üzerinde okunaklı
const source = join(root, 'public', 'liberte-logo-source.png');

// Launcher ikonu — krem zemin + tam logo
async function buildSquareIcon(size, dest, paddingRatio = 0.08) {
  const padding = Math.max(2, Math.round(size * paddingRatio));
  const inner = size - padding * 2;

  const logoBuf = await sharp(source)
    .resize(inner, inner, { fit: 'contain', background: BRAND_CREAM_RGB })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: BRAND_CREAM_RGB
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
    console.log(`${relPath} (${size}px, krem zemin + tam rozet)`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
