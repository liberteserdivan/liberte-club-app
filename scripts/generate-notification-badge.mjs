import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const size = 96;
const padding = 10;

// liberte-logo.png → Android badge (beyaz siluet, şeffaf arka plan)
async function buildNotificationBadge() {
  const source = join(root, 'public', 'liberte-logo.png');
  const dest = join(root, 'public', 'notification-badge.png');

  const trimmed = await sharp(source)
    .trim({ threshold: 14 })
    .png()
    .toBuffer();

  const inner = size - padding * 2;
  const { data, info } = await sharp(trimmed)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({
      top: padding,
      bottom: padding,
      left: padding,
      right: padding,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.alloc(data.length);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    if (a < 12) {
      out[i + 3] = 0;
      continue;
    }

    // Logo mürekkebi: beyaz arka plan hariç tüm pikseller (yaprak, yazı, çember)
    const isWhiteBg = r > 232 && g > 232 && b > 232;
    if (!isWhiteBg) {
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

  console.log(`notification-badge.png = liberte-logo silueti (%${Math.round((ink / total) * 100)} doluluk).`);
}

buildNotificationBadge().catch((error) => {
  console.error(error);
  process.exit(1);
});
