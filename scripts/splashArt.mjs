import { access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { BRAND_FOREST, BRAND_FOREST_RGB } from './iconBrand.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SPLASH_MASTER_FILE = 'liberte-club-splash-master.png';
const logoSource = join(root, 'public', 'liberte-logo-source.png');

// Master açılış görseli yolu
export function getSplashMasterPath() {
  return join(root, 'public', SPLASH_MASTER_FILE);
}

// Yeşil zemin + logo + metin — AppSplash ile aynı tasarım
function buildSplashSvg(width, height) {
  const cx = width / 2;
  const logoSize = Math.round(Math.min(width, height) * 0.34);
  const titleSize = Math.round(width * 0.082);
  const subSize = Math.round(width * 0.028);
  const sloganSize = Math.round(width * 0.032);
  const centerY = height * 0.46;

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
  <text x="${cx}" y="${centerY + logoSize * 0.72}" text-anchor="middle"
    font-family="Georgia, 'Times New Roman', serif" font-size="${titleSize}" font-weight="700"
    fill="#FFFFFF" letter-spacing="-1">Liberte Club</text>
  <text x="${cx}" y="${centerY + logoSize * 0.72 + titleSize * 0.95}" text-anchor="middle"
    font-family="Arial, Helvetica, sans-serif" font-size="${subSize}" font-weight="800"
    fill="#D8C29D" letter-spacing="6">GASTRO CAFE</text>
  <text x="${cx}" y="${centerY + logoSize * 0.72 + titleSize * 1.85}" text-anchor="middle"
    font-family="Arial, Helvetica, sans-serif" font-size="${sloganSize}" font-weight="600"
    fill="#D1D1D1">Liberte&apos;de müdavim olmak kazandırır.</text>
</svg>`);
}

// Logo + metin katmanlı splash PNG üret
export async function buildSplashFromMaster(width, height, dest) {
  const logoSize = Math.round(Math.min(width, height) * 0.34);
  const centerY = Math.round(height * 0.46 - logoSize / 2);

  const logoBuf = await sharp(logoSource)
    .resize(logoSize, logoSize, { fit: 'contain', background: { ...BRAND_FOREST_RGB, alpha: 0 } })
    .png()
    .toBuffer();

  const baseSvg = buildSplashSvg(width, height);

  await sharp(baseSvg)
    .composite([{
      input: logoBuf,
      top: Math.max(0, centerY),
      left: Math.max(0, Math.round((width - logoSize) / 2))
    }])
    .png({ compressionLevel: 9, force: true })
    .toFile(dest);
}

// Tek master dosyayı da güncelle (React splash aynı görseli kullanır)
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
