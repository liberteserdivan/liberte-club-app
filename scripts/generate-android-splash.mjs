import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const SPLASH_XML = `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@color/splash_background" />
</layer-list>`;

const SPLASH_FOLDERS = [
  'drawable',
  'drawable-port-mdpi',
  'drawable-port-hdpi',
  'drawable-port-xhdpi',
  'drawable-port-xxhdpi',
  'drawable-port-xxxhdpi'
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

// Eski tam ekran PNG splash dosyalarını temizle
async function removeLegacySplashPng(resRoot, folder) {
  try {
    await rm(join(resRoot, folder, 'splash.png'));
    console.log(`silindi: android/${folder}/splash.png`);
  } catch {
    // Dosya yoksa geç
  }
}

async function main() {
  const resRoot = join(root, 'android', 'app', 'src', 'main', 'res');
  const drawableDir = join(resRoot, 'drawable');
  await mkdir(drawableDir, { recursive: true });

  for (const folder of SPLASH_FOLDERS) {
    await removeLegacySplashPng(resRoot, folder);
  }

  await writeFile(join(drawableDir, 'splash.xml'), SPLASH_XML, 'utf8');
  console.log('android/drawable/splash.xml (yalnizca yesil zemin)');

  await writeEmptySplashIcon(join(drawableDir, 'splash_icon_empty.png'));
  console.log('android/drawable/splash_icon_empty.png');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
