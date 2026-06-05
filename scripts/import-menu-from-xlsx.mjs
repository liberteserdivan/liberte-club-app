/**
 * Excel menü dosyasını okuyup menuSeed.js üretir.
 * Kullanım: node scripts/import-menu-from-xlsx.mjs "yol/urunler.xlsx"
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const xlsxPath = process.argv[2] || path.join(
  process.env.USERPROFILE || '',
  'Downloads',
  'Liberte Gastro Cafe_urunler_2026-06-05.xlsx'
);

// Ek hizmet / seçenek satırları menüde gösterilmez
const SKIP_NAMES = /^laktozsuz$|^extra buz$/i;

const CATEGORY_META = {
  'Espresso Bazlı Sıcak Kahveler': { icon: '☕', tone: '#b69474', short: 'Sıcak Kahve' },
  'Espresso Bazlı Soğuk Kahveler': { icon: '🧊', tone: '#4b8aa8', short: 'Soğuk Kahve' },
  'Tatlılar': { icon: '🍰', tone: '#d6ad70', short: 'Tatlılar' },
  'Sıcak İçecekler': { icon: '🍵', tone: '#8b6914', short: 'Sıcak İçecek' },
  'Soğuk İçecekler': { icon: '🥤', tone: '#5ba3c6', short: 'Soğuk İçecek' },
  'Sandvic Çeşitleri': { icon: '🥪', tone: '#c4a035', short: 'Sandviç' },
  'Hamburger Çeşitleri': { icon: '🍔', tone: '#a0482d', short: 'Burger' }
};

// Varyasyonlu ürün adını oluştur
function buildDisplayName(name, variationName) {
  const base = String(name || '').trim();
  const variant = String(variationName || '').trim();
  if (!variant) return base;
  const bl = base.toLowerCase();
  const vl = variant.toLowerCase();
  if (vl.includes(bl) || variant.length > base.length + 2) return variant;
  return `${base} ${variant}`;
}

// Kategori ikonuna göre emoji tahmini
function guessEmoji(name, categoryIcon) {
  const n = name.toLowerCase();
  if (/burger|smash|vişne/.test(n)) return '🍔';
  if (/sandvic|sandwich/.test(n)) return '🥪';
  if (/waffle|cheesecake|browni|pasta|magnolia|tiramisu|spoonful|san sebastian|paris|cream puff|cookie/.test(n)) return '🍰';
  if (/latte|espresso|cappuccino|americano|mocha|macchiato|filtre|flat white|cortado|matcha/.test(n)) return '☕';
  if (/ice |buzlu|soğuk kahve|İce /.test(n)) return '🧊';
  if (/çay|sahlep|çikolata|türk kahve|dibek/.test(n)) return '🍵';
  if (/cola|fanta|limonata|soda|frozen|hibiscus|churchill|su|fuse|lipton|cool lime|mango/.test(n)) return '🥤';
  if (/patates/.test(n)) return '🍟';
  return categoryIcon || '•';
}

// XLSX zip içinden satırları oku
function readXlsxRows(filePath) {
  const tmpDir = path.join(__dirname, '..', '.tmp-menu-xlsx');
  const zipCopy = path.join(tmpDir, 'menu.zip');
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.copyFileSync(filePath, zipCopy);

  execSync(
    `powershell -NoProfile -Command "Expand-Archive -Path '${zipCopy.replace(/'/g, "''")}' -DestinationPath '${tmpDir.replace(/'/g, "''")}' -Force"`,
    { stdio: 'pipe' }
  );

  const sstXml = fs.readFileSync(path.join(tmpDir, 'xl', 'sharedStrings.xml'), 'utf8');
  const sheetXml = fs.readFileSync(path.join(tmpDir, 'xl', 'worksheets', 'sheet1.xml'), 'utf8');

  const strings = [...sstXml.matchAll(/<si>(?:<t[^>]*>([^<]*)<\/t>|<r><t[^>]*>([^<]*)<\/t>)/g)]
    .map((m) => m[1] ?? m[2] ?? '');

  const colIndex = (ref) => ref.replace(/\d+/g, '').split('').reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

  const rows = new Map();
  for (const cell of sheetXml.matchAll(/<c r="([A-Z]+\d+)"([^>]*)><v>([^<]*)<\/v><\/c>/g)) {
    const [, ref, attrs, raw] = cell;
    const rowNum = Number(ref.replace(/\D+/g, ''));
    if (rowNum < 2) continue;
    const col = colIndex(ref);
    const isStr = attrs.includes('t="s"');
    const value = isStr ? (strings[Number(raw)] ?? '') : Number(raw);
    if (!rows.has(rowNum)) rows.set(rowNum, []);
    rows.get(rowNum)[col] = value;
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });
  return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, cols]) => cols);
}

// Menü sürümü — Excel yeniden import edildiğinde artırın
const MENU_REVISION = 1;

// menuSeed.js dosya içeriğini üret
function toModuleSource(categories, items) {
  return `// Liberte menü verisi — Excel'den otomatik üretildi. Elle düzenlemeyin; scripts/import-menu-from-xlsx.mjs kullanın.
export const MENU_REVISION = ${MENU_REVISION};

export const menuCategories = ${JSON.stringify(categories, null, 2)};

export const menuItems = ${JSON.stringify(items, null, 2)};
`;
}

// API tarafı için JSON paketi
function toApiBundle(categories, items) {
  return { revision: MENU_REVISION, categories, items };
}

function main() {
  if (!fs.existsSync(xlsxPath)) {
    console.error('Dosya bulunamadı:', xlsxPath);
    process.exit(1);
  }

  const rawRows = readXlsxRows(xlsxPath);
  const categories = [];
  const categoryIdByName = new Map();
  const items = [];
  const seen = new Set();
  const baseProductMeta = new Map();
  let itemId = 1;

  for (const cols of rawRows) {
    const [
      , name, description, categoryName, mainPrice,
      variationName, variationPrice, status, popular
    ] = cols;

    if (!name || !categoryName || status === 'Mevcut Değil') continue;
    if (SKIP_NAMES.test(String(name).trim())) continue;

    const baseName = String(name).trim();
    if (!categoryIdByName.has(categoryName)) {
      const id = categories.length + 1;
      const meta = CATEGORY_META[categoryName] || { icon: '•', tone: '#78dfbb', short: categoryName };
      categories.push({
        id,
        name: meta.short || categoryName,
        description: categoryName,
        icon: meta.icon
      });
      categoryIdByName.set(categoryName, id);
    }

    const categoryId = categoryIdByName.get(categoryName);
    const meta = CATEGORY_META[categoryName] || { icon: '•', tone: '#78dfbb' };
    const price = Math.round(Number(variationPrice) > 0 ? Number(variationPrice) : Number(mainPrice));
    const displayName = buildDisplayName(baseName, variationName);
    const dedupeKey = `${categoryId}|${displayName.toLowerCase()}|${price}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const productKey = `${categoryId}|${baseName.toLowerCase()}`;
    if (!baseProductMeta.has(productKey)) {
      baseProductMeta.set(productKey, { categoryId, baseName, description, mainPrice: Math.round(Number(mainPrice)), meta, popular });
    }

    const isPopular = popular === 'Evet';
    items.push({
      id: itemId++,
      categoryId,
      name: displayName,
      description: String(description || '').trim() || displayName,
      price,
      featured: isPopular,
      best: isPopular,
      image: guessEmoji(displayName, meta.icon),
      tone: meta.tone,
      imageUrl: ''
    });
  }

  // Ana ürün satırı yoksa (sadece varyasyonlar varsa) temel fiyatlı kayıt ekle
  for (const [key, meta] of baseProductMeta) {
    const hasBase = items.some(
      (i) => i.categoryId === meta.categoryId && i.name.toLowerCase() === meta.baseName.toLowerCase()
    );
    if (hasBase || !meta.mainPrice) continue;
    const dedupeKey = `${meta.categoryId}|${meta.baseName.toLowerCase()}|${meta.mainPrice}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    items.push({
      id: itemId++,
      categoryId: meta.categoryId,
      name: meta.baseName,
      description: String(meta.description || '').trim() || meta.baseName,
      price: meta.mainPrice,
      featured: meta.popular === 'Evet',
      best: meta.popular === 'Evet',
      image: guessEmoji(meta.baseName, meta.meta.icon),
      tone: meta.meta.tone,
      imageUrl: ''
    });
  }

  items.sort((a, b) => a.categoryId - b.categoryId || a.name.localeCompare(b.name, 'tr'));
  items.forEach((item, idx) => { item.id = idx + 1; });

  const jsPath = path.join(__dirname, '..', 'src', 'lib', 'menuSeed.js');
  const jsonPath = path.join(__dirname, '..', 'api', 'lib', 'menuSeed.json');
  fs.writeFileSync(jsPath, toModuleSource(categories, items), 'utf8');
  fs.writeFileSync(jsonPath, `${JSON.stringify(toApiBundle(categories, items), null, 2)}\n`, 'utf8');
  console.log(`Kategori: ${categories.length}, Ürün: ${items.length}, Sürüm: ${MENU_REVISION}`);
  console.log('Yazıldı:', jsPath);
  console.log('Yazıldı:', jsonPath);
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
