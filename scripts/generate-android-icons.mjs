import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { BRAND_CREAM_RGB } from './iconBrand.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'public', 'liberte-logo-source.png');
const resRoot = join(root, 'android', 'app', 'src', 'main', 'res');

const DENSITIES = [
  { folder: 'mipmap-mdpi', size: 48, foreground: 108 },
  { folder: 'mipmap-hdpi', size: 72, foreground: 162 },
  { folder: 'mipmap-xhdpi', size: 96, foreground: 216 },
  { folder: 'mipmap-xxhdpi', size: 144, foreground: 324 },
  { folder: 'mipmap-xxxhdpi', size: 192, foreground: 432 }
];

async function buildSquareIcon(size, dest) {
  const padding = Math.max(2, Math.round(size * 0.08));
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

async function buildForeground(size, dest) {
  const logoSize = Math.round(size * 0.62);
  const logoBuf = await sharp(source)
    .resize(logoSize, logoSize, { fit: 'contain', background: BRAND_CREAM_RGB })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{ input: logoBuf, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toFile(dest);
}

async function main() {
  for (const row of DENSITIES) {
    const dir = join(resRoot, row.folder);
    await mkdir(dir, { recursive: true });
    await buildSquareIcon(row.size, join(dir, 'ic_launcher.png'));
    await buildSquareIcon(row.size, join(dir, 'ic_launcher_round.png'));
    await buildForeground(row.foreground, join(dir, 'ic_launcher_foreground.png'));
    console.log(`${row.folder} ikonları hazır`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
