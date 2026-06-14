import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSplashFromMaster } from './splashArt.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Android portrait splash boyutları
const ANDROID_SPLASH_SIZES = [
  { folder: 'drawable-port-mdpi', w: 320, h: 480 },
  { folder: 'drawable-port-hdpi', w: 480, h: 800 },
  { folder: 'drawable-port-xhdpi', w: 720, h: 1280 },
  { folder: 'drawable-port-xxhdpi', w: 960, h: 1600 },
  { folder: 'drawable-port-xxxhdpi', w: 1280, h: 1920 }
];

async function main() {
  const resRoot = join(root, 'android', 'app', 'src', 'main', 'res');

  for (const row of ANDROID_SPLASH_SIZES) {
    const dir = join(resRoot, row.folder);
    await mkdir(dir, { recursive: true });
    const dest = join(dir, 'splash.png');
    await buildSplashFromMaster(row.w, row.h, dest);
    console.log(`android/${row.folder}/splash.png`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
