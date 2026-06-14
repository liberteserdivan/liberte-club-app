import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { buildSplashFromMaster } from './splashArt.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Android portrait splash boyutları + varsayılan fallback
const ANDROID_SPLASH_SIZES = [
  { folder: 'drawable', w: 720, h: 1280 },
  { folder: 'drawable-port-mdpi', w: 320, h: 480 },
  { folder: 'drawable-port-hdpi', w: 480, h: 800 },
  { folder: 'drawable-port-xhdpi', w: 720, h: 1280 },
  { folder: 'drawable-port-xxhdpi', w: 960, h: 1600 },
  { folder: 'drawable-port-xxxhdpi', w: 1280, h: 1920 }
];

// Android 12+ sistem splash ikonunu gizlemek için şeffaf piksel
async function writeEmptySplashIcon(dest) {
  await sharp({
    create: {
      width: 1,
      height: 1,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .png()
    .toFile(dest);
}

async function main() {
  const resRoot = join(root, 'android', 'app', 'src', 'main', 'res');

  for (const row of ANDROID_SPLASH_SIZES) {
    const dir = join(resRoot, row.folder);
    await mkdir(dir, { recursive: true });
    const dest = join(dir, 'splash.png');
    await buildSplashFromMaster(row.w, row.h, dest);
    console.log(`android/${row.folder}/splash.png`);
  }

  const drawableDir = join(resRoot, 'drawable');
  await mkdir(drawableDir, { recursive: true });
  await writeEmptySplashIcon(join(drawableDir, 'splash_icon_empty.png'));
  console.log('android/drawable/splash_icon_empty.png');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
