import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let cachedBundle = null;

// Sunucu menü paketini yükle
function loadMenuBundle() {
  if (cachedBundle) return cachedBundle;
  const raw = readFileSync(join(__dirname, 'menuSeed.json'), 'utf8');
  cachedBundle = JSON.parse(raw);
  return cachedBundle;
}

// Eski veritabanı menüsünü güncel seed ile değiştir
export function applyMenuSync(state) {
  if (!state) return { state: null, changed: false };

  const bundle = loadMenuBundle();
  const current = Number(state.menuRevision || 0);
  if (current >= bundle.revision) {
    return { state, changed: false };
  }

  return {
    state: {
      ...state,
      menuRevision: bundle.revision,
      categories: bundle.categories,
      items: bundle.items
    },
    changed: true
  };
}
