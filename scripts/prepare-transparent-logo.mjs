import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(root, 'public', 'liberte-logo.png');
const sourceFile = join(root, 'public', 'liberte-logo-source.png');
const manualTransparent = join(root, 'public', 'liberte-logo-transparent.png');

// Beyaz zemin piksellerini şeffaf yap
async function stripLightBackground(buffer) {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const avg = (r + g + b) / 3;

    if (avg > 232 && r > 220 && g > 220 && b > 215) {
      data[i + 3] = 0;
    }
  }

  return sharp(data, { raw: { width, height, channels } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main() {
  if (existsSync(manualTransparent)) {
    const manual = await readFile(manualTransparent);
    await sharp(manual).png().toFile(dest);
    console.log('Manuel şeffaf logo: liberte-logo-transparent.png');
    return;
  }

  const inputPath = existsSync(sourceFile) ? sourceFile : dest;
  const source = await readFile(inputPath);
  const output = await stripLightBackground(source);
  await sharp(output).toFile(dest);
  console.log(`Şeffaf logo üretildi (${existsSync(sourceFile) ? 'kaynak' : 'mevcut'} dosyadan)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
