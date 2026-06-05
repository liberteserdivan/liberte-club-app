import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'public', 'liberte-logo.png');
const white = { r: 255, g: 255, b: 255 };

// Logo dosyasını beyaz zeminli kare ikona dönüştür — şeffaf alan kalmasın
async function buildSquareIcon(size, dest, paddingRatio = 0.06) {
  const padding = Math.max(2, Math.round(size * paddingRatio));
  const inner = size - padding * 2;

  await sharp(source)
    .resize(inner, inner, { fit: 'contain', background: white })
    .extend({
      top: padding,
      bottom: padding,
      left: padding,
      right: padding,
      background: white
    })
    .flatten({ background: '#ffffff' })
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
    console.log(`${relPath} (${size}px, beyaz zemin)`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
