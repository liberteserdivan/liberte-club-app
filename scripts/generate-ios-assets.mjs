import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { BRAND_FOREST_RGB } from './iconBrand.mjs';

// iOS uygulama ikonu ve açılış (splash) görsellerini logodan üretir.
// App Store kuralı: uygulama ikonu alfa/şeffaflık içeremez (düz zemin gerekir).

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// İkon için beyaz zeminli logo, splash için şeffaf zeminli logo kullanılır
const logoSource = join(root, 'public', 'liberte-logo-source.png');
const assetsRoot = join(root, 'ios', 'App', 'App', 'Assets.xcassets');
const appIconDir = join(assetsRoot, 'AppIcon.appiconset');
const splashDir = join(assetsRoot, 'Splash.imageset');

const APP_ICON_SIZE = 1024; // App Store tek boyut (1024x1024) bekler
const SPLASH_SIZE = 2732; // Capacitor varsayılan splash boyutu

// Düz beyaz zemin üzerinde ortalanmış logo (alfasız) → App Store ikon kuralına uygun.
// Logonun kendi zemini beyaz olduğundan beyaz seçilir; böylece iki tonlu kare görüntü oluşmaz.
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
      channels: 3, // alfa yok
      background: ICON_BG
    }
  })
    .composite([{ input: logoBuf, gravity: 'center' }])
    .png({ compressionLevel: 9, force: true })
    .toFile(dest);
}

// Düz orman yeşili — React splash ile aynı zemin
async function buildSplash(dest) {
  await sharp({
    create: {
      width: SPLASH_SIZE,
      height: SPLASH_SIZE,
      channels: 3,
      background: BRAND_FOREST_RGB
    }
  })
    .png({ compressionLevel: 9, force: true })
    .toFile(dest);
}

async function main() {
  await mkdir(appIconDir, { recursive: true });
  await mkdir(splashDir, { recursive: true });

  await buildAppIcon(join(appIconDir, 'AppIcon-512@2x.png'));
  console.log('iOS app ikonu hazır: AppIcon-512@2x.png');

  // Splash.imageset üç ölçek için aynı 2732x2732 görseli paylaşır
  await buildSplash(join(splashDir, 'splash-2732x2732.png'));
  await buildSplash(join(splashDir, 'splash-2732x2732-1.png'));
  await buildSplash(join(splashDir, 'splash-2732x2732-2.png'));
  console.log('iOS splash görselleri hazır.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
