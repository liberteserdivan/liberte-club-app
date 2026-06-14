import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { buildGreenNativeSplash, buildSplashFromMaster } from './splashArt.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const logoSource = join(root, 'public', 'liberte-logo-source.png');
const assetsRoot = join(root, 'ios', 'App', 'App', 'Assets.xcassets');
const appIconDir = join(assetsRoot, 'AppIcon.appiconset');
const splashDir = join(assetsRoot, 'Splash.imageset');

const APP_ICON_SIZE = 1024;
const SPLASH_SIZE = 2732;
const ICON_BG = { r: 255, g: 255, b: 255 };

async function buildAppIcon(dest) {
  const inner = Math.round(APP_ICON_SIZE * 0.84);
  const logoBuf = await sharp(logoSource)
    .resize(inner, inner, { fit: 'contain', background: ICON_BG })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: APP_ICON_SIZE,
      height: APP_ICON_SIZE,
      channels: 3,
      background: ICON_BG
    }
  })
    .composite([{ input: logoBuf, gravity: 'center' }])
    .png({ compressionLevel: 9, force: true })
    .toFile(dest);
}

async function main() {
  await mkdir(appIconDir, { recursive: true });
  await mkdir(splashDir, { recursive: true });

  await buildAppIcon(join(appIconDir, 'AppIcon-512@2x.png'));
  console.log('iOS app ikonu hazır: AppIcon-512@2x.png');

  const splashDest = join(splashDir, 'splash-2732x2732.png');
  await buildGreenNativeSplash(SPLASH_SIZE, SPLASH_SIZE, splashDest);
  await sharp(splashDest).toFile(join(splashDir, 'splash-2732x2732-1.png'));
  await sharp(splashDest).toFile(join(splashDir, 'splash-2732x2732-2.png'));
  console.log('iOS native splash: yalnizca yesil zemin');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
