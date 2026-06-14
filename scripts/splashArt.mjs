import { access, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { BRAND_FOREST } from './iconBrand.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SPLASH_MASTER_FILE = 'liberte-club-splash-master.png';
const logoSource = join(root, 'public', 'liberte-logo-source.png');

// Referans splash oranları — React CSS ile aynı
const BADGE_RATIO = 0.42;
const BADGE_TOP_RATIO = 0.34;
const TITLE_SIZE_RATIO = 0.058;
const SUB_SIZE_RATIO = 0.024;
const SLOGAN_SIZE_RATIO = 0.028;

// Master açılış görseli yolu
export function getSplashMasterPath() {
  return join(root, 'public', SPLASH_MASTER_FILE);
}

// Yeşil zemin SVG — native açılış (logo/metin React CSS'te)
function buildGreenSplashSvg(width, height) {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="mintOrb" cx="18%" cy="8%" r="42%">
      <stop offset="0%" stop-color="#9FDCC7" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#9FDCC7" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="goldOrb" cx="88%" cy="92%" r="46%">
      <stop offset="0%" stop-color="#D8C29D" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#D8C29D" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="${BRAND_FOREST}"/>
  <rect width="100%" height="100%" fill="url(#mintOrb)"/>
  <rect width="100%" height="100%" fill="url(#goldOrb)"/>
</svg>`);
}

// Native iOS/Android — yalnızca yeşil zemin (metin React'ta)
export async function buildGreenNativeSplash(width, height, dest) {
  await sharp(buildGreenSplashSvg(width, height))
    .png({ compressionLevel: 9, force: true })
    .toFile(dest);
}

// Daire rozet — PWA startup görselleri için
function buildBadgeSvg(diameter) {
  const r = diameter / 2;
  const stroke = Math.max(2, Math.round(diameter * 0.012));

  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${diameter}" height="${diameter}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="${r}" cy="${r}" r="${r - stroke / 2}" fill="#FFFFFF" stroke="${BRAND_FOREST}" stroke-width="${stroke}"/>
</svg>`);
}

// Kaynak logoyu daire içine kırp
async function loadCircularLogo(diameter) {
  const source = await readFile(logoSource);

  const mask = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${diameter}" height="${diameter}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="${diameter / 2}" cy="${diameter / 2}" r="${diameter / 2}" fill="#fff"/>
</svg>`);

  return sharp(source)
    .resize(diameter, diameter, { fit: 'cover', position: 'centre' })
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

// Metin katmanı — referans splash ile birebir
function buildSplashSvg(width, height) {
  const cx = width / 2;
  const badgeSize = Math.round(width * BADGE_RATIO);
  const titleSize = Math.round(width * TITLE_SIZE_RATIO);
  const subSize = Math.round(width * SUB_SIZE_RATIO);
  const sloganSize = Math.round(width * SLOGAN_SIZE_RATIO);
  const badgeTop = Math.round(height * BADGE_TOP_RATIO);
  const textTop = badgeTop + badgeSize + Math.round(titleSize * 1.35);

  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="mintOrb" cx="18%" cy="8%" r="42%">
      <stop offset="0%" stop-color="#9FDCC7" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#9FDCC7" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="goldOrb" cx="88%" cy="92%" r="46%">
      <stop offset="0%" stop-color="#D8C29D" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#D8C29D" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="${BRAND_FOREST}"/>
  <rect width="100%" height="100%" fill="url(#mintOrb)"/>
  <rect width="100%" height="100%" fill="url(#goldOrb)"/>
  <text x="${cx}" y="${textTop}" text-anchor="middle"
    font-family="Georgia, 'Times New Roman', serif" font-size="${titleSize}" font-weight="700"
    fill="#FFFFFF" letter-spacing="-1">Liberte Club</text>
  <text x="${cx}" y="${textTop + titleSize * 1.08}" text-anchor="middle"
    font-family="Arial, Helvetica, sans-serif" font-size="${subSize}" font-weight="800"
    fill="#D8C29D" letter-spacing="6">GASTRO CAFE</text>
  <text x="${cx}" y="${textTop + titleSize * 2.15}" text-anchor="middle"
    font-family="Arial, Helvetica, sans-serif" font-size="${sloganSize}" font-weight="600"
    fill="#D1D1D1">Liberte&apos;de müdavim olmak kazandırır.</text>
</svg>`);
}

// Logo + metin katmanlı splash PNG üret (native iOS / PWA startup)
export async function buildSplashFromMaster(width, height, dest) {
  const badgeSize = Math.round(width * BADGE_RATIO);
  const badgeTop = Math.round(height * BADGE_TOP_RATIO);
  const badgeLeft = Math.round((width - badgeSize) / 2);

  const badgeBg = await sharp(buildBadgeSvg(badgeSize)).png().toBuffer();
  const logoBuf = await loadCircularLogo(badgeSize);

  const baseSvg = buildSplashSvg(width, height);

  await sharp(baseSvg)
    .composite([
      { input: badgeBg, top: badgeTop, left: badgeLeft },
      { input: logoBuf, top: badgeTop, left: badgeLeft }
    ])
    .png({ compressionLevel: 9, force: true })
    .toFile(dest);
}

// Tek master dosyayı da güncelle (PWA startup görselleri)
export async function buildSplashMaster(width = 1290, height = 2796) {
  const dest = getSplashMasterPath();
  await buildSplashFromMaster(width, height, dest);
  return dest;
}

// Master varsa onu kullan, yoksa üret
export async function ensureSplashMaster() {
  try {
    await access(getSplashMasterPath());
  } catch {
    await buildSplashMaster();
  }
}
