import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'public', 'liberte-logo.png');
const forest = { r: 11, g: 47, b: 38 };

// iOS PWA açılış görselleri — portrait
const IOS_SPLASH_SCREENS = [
  {
    w: 1290,
    h: 2796,
    file: 'ios-1290x2796.png',
    media: '(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)'
  },
  {
    w: 1179,
    h: 2556,
    file: 'ios-1179x2556.png',
    media: '(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)'
  },
  {
    w: 1170,
    h: 2532,
    file: 'ios-1170x2532.png',
    media: '(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)'
  },
  {
    w: 1284,
    h: 2778,
    file: 'ios-1284x2778.png',
    media: '(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)'
  },
  {
    w: 1242,
    h: 2688,
    file: 'ios-1242x2688.png',
    media: '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)'
  },
  {
    w: 828,
    h: 1792,
    file: 'ios-828x1792.png',
    media: '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)'
  },
  {
    w: 750,
    h: 1334,
    file: 'ios-750x1334.png',
    media: '(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)'
  }
];

// Yeşil zemin üzerine ortalanmış logo
async function buildSplashCanvas(width, height, dest) {
  const logoSize = Math.round(Math.min(width, height) * 0.26);
  const logoBuf = await sharp(source)
    .resize(logoSize, logoSize, { fit: 'contain', background: { ...forest, alpha: 1 } })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: forest
    }
  })
    .composite([{ input: logoBuf, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toFile(dest);
}

// Android merkez ikonu
async function buildAndroidSplashLogo(dest, size = 512) {
  const logoSize = Math.round(size * 0.72);
  const logoBuf = await sharp(source)
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
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

function buildIosLinkTags() {
  const lines = IOS_SPLASH_SCREENS.map(
    (row) => `  <link rel="apple-touch-startup-image" href="/splash/${row.file}" media="${row.media}" />`
  );
  lines.push('  <link rel="apple-touch-startup-image" href="/splash/ios-1284x2778.png" />');
  return lines.join('\n');
}

async function patchIndexHtml() {
  const indexPath = join(root, 'index.html');
  const html = await readFile(indexPath, 'utf8');
  const start = '  <!-- SPLASH-LINKS-START -->';
  const end = '  <!-- SPLASH-LINKS-END -->';
  const block = `${start}\n${buildIosLinkTags()}\n  ${end}`;

  if (!html.includes(start)) {
    throw new Error('index.html içinde SPLASH-LINKS işaretçileri bulunamadı.');
  }

  const next = html.replace(new RegExp(`${start}[\\s\\S]*?${end}`), `${start}\n${buildIosLinkTags()}\n  ${end}`);
  await writeFile(indexPath, next, 'utf8');
}

async function main() {
  const splashDir = join(root, 'public', 'splash');
  const androidDrawable = join(root, 'android', 'app', 'src', 'main', 'res', 'drawable');
  await mkdir(splashDir, { recursive: true });
  await mkdir(androidDrawable, { recursive: true });

  for (const row of IOS_SPLASH_SCREENS) {
    const dest = join(splashDir, row.file);
    await buildSplashCanvas(row.w, row.h, dest);
    console.log(`splash/${row.file}`);
  }

  await buildAndroidSplashLogo(join(androidDrawable, 'splash_logo.png'));
  console.log('android drawable/splash_logo.png');

  await patchIndexHtml();
  console.log('index.html iOS startup linkleri güncellendi.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
