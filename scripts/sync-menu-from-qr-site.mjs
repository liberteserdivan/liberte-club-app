/**
 * menu.libertegastrocafe.com public API -> menuSeed.js + menuSeed.json
 * Kullanim: node scripts/sync-menu-from-qr-site.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const SOURCE = process.env.QR_MENU_URL || 'https://menu.libertegastrocafe.com/api/menu/public?lang=tr';
const MENU_REVISION = Number(process.env.MENU_REVISION || 2);

function toSeedItem(item) {
  return {
    id: Number(item.id),
    categoryId: Number(item.categoryId),
    name: String(item.name || '').trim(),
    description: String(item.description || item.name || '').trim(),
    price: Math.round(Number(item.price) || 0),
    featured: Boolean(item.featured),
    best: Boolean(item.best),
    image: String(item.image || '•'),
    tone: String(item.tone || '#78dfbb'),
    imageUrl: String(item.imageUrl || '')
  };
}

function toSeedCategory(cat) {
  return {
    id: Number(cat.id),
    name: String(cat.name || '').trim(),
    description: String(cat.description || '').trim(),
    icon: String(cat.icon || '•')
  };
}

function toModuleSource(categories, items) {
  return `// Liberte menu verisi — menu.libertegastrocafe.com ile senkron. Elle duzenlemeyin; scripts/sync-menu-from-qr-site.mjs kullanin.
export const MENU_REVISION = ${MENU_REVISION};

export const menuCategories = ${JSON.stringify(categories, null, 2)};

export const menuItems = ${JSON.stringify(items, null, 2)};
`;
}

const res = await fetch(SOURCE);
if (!res.ok) {
  console.error('Menu API hata:', res.status);
  process.exit(1);
}
const data = await res.json();
if (!data?.ok || !Array.isArray(data.categories) || !Array.isArray(data.items)) {
  console.error('Menu API gecersiz yanit');
  process.exit(1);
}

const categories = data.categories.map(toSeedCategory).sort((a, b) => a.id - b.id);
const items = data.items
  .map(toSeedItem)
  .filter((item) => item.name && item.price >= 0)
  .sort((a, b) => a.categoryId - b.categoryId || a.name.localeCompare(b.name, 'tr'));

// ID'leri stabil tut: kaynak id varsa koru, yoksa sirala
items.forEach((item, idx) => {
  if (!Number.isFinite(item.id) || item.id < 1) item.id = idx + 1;
});

const jsPath = path.join(root, 'src', 'lib', 'menuSeed.js');
const jsonPath = path.join(root, 'api', '_lib', 'menuSeed.json');
fs.writeFileSync(jsPath, toModuleSource(categories, items), 'utf8');
fs.writeFileSync(jsonPath, `${JSON.stringify({ revision: MENU_REVISION, categories, items }, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  source: SOURCE,
  revision: MENU_REVISION,
  categories: categories.length,
  items: items.length,
  jsPath,
  jsonPath
}, null, 2));