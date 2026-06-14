import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { stripLightBackground } from './logoAlpha.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(root, 'public', 'liberte-logo.png');
const sourceFile = join(root, 'public', 'liberte-logo-source.png');
const manualTransparent = join(root, 'public', 'liberte-logo-transparent.png');

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
