import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const size = 96;

// Android durum çubuğu — yalnızca logo mürekkebi beyaz siluet, arka plan şeffaf
async function buildNotificationBadge() {
  const source = join(root, 'public', 'liberte-logo.png');
  const dest = join(root, 'public', 'notification-badge.png');

  const { data, info } = await sharp(source)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.alloc(data.length);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    if (a < 16) {
      out[i + 3] = 0;
      continue;
    }

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max === 0 ? 0 : (max - min) / max;
    const isWhiteBg = r > 228 && g > 228 && b > 228;
    const isLogoInk = !isWhiteBg && (saturation > 0.07 || max < 210);

    if (isLogoInk) {
      out[i] = 255;
      out[i + 1] = 255;
      out[i + 2] = 255;
      out[i + 3] = 255;
    } else {
      out[i + 3] = 0;
    }
  }

  await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(dest);

  const check = await sharp(dest).raw().toBuffer({ resolveWithObject: true });
  let ink = 0;
  const total = check.info.width * check.info.height;
  for (let i = 3; i < check.data.length; i += 4) {
    if (check.data[i] > 0) ink += 1;
  }

  console.log(`notification-badge.png güncellendi (siluet %${Math.round((ink / total) * 100)}).`);
}

buildNotificationBadge().catch((error) => {
  console.error(error);
  process.exit(1);
});
