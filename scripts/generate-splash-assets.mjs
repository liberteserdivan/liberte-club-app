import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSplashFromMaster, buildSplashMaster, ensureSplashMaster } from './splashArt.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

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

  if (!html.includes(start)) {
    throw new Error('index.html içinde SPLASH-LINKS işaretçileri bulunamadı.');
  }

  const next = html.replace(new RegExp(`${start}[\\s\\S]*?${end}`), `${start}\n${buildIosLinkTags()}\n  ${end}`);
  await writeFile(indexPath, next, 'utf8');
}

async function main() {
  await buildSplashMaster();
  console.log(`public/liberte-club-splash-master.png`);

  const splashDir = join(root, 'public', 'splash');
  await mkdir(splashDir, { recursive: true });

  for (const row of IOS_SPLASH_SCREENS) {
    const dest = join(splashDir, row.file);
    await buildSplashFromMaster(row.w, row.h, dest);
    console.log(`splash/${row.file}`);
  }

  await patchIndexHtml();
  console.log('index.html iOS startup linkleri güncellendi.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
