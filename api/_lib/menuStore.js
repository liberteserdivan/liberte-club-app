import { getSql } from './sql.js';
import { isProductionRuntime } from './schemaReady.js';

// Menü tablolarını hazırla — production'da DDL atlanır
export async function ensureMenuTables(sql) {
  if (isProductionRuntime()) return;
  await sql`CREATE TABLE IF NOT EXISTS menu_categories (
    id bigint PRIMARY KEY,
    name text NOT NULL,
    sort_order int NOT NULL DEFAULT 0,
    legacy_json jsonb
  )`;
  await sql`CREATE TABLE IF NOT EXISTS menu_items (
    id bigint PRIMARY KEY,
    category_id bigint REFERENCES menu_categories(id) ON DELETE SET NULL,
    name text NOT NULL,
    price numeric,
    description text,
    image text,
    lp_gain int,
    active boolean NOT NULL DEFAULT true,
    legacy_json jsonb
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items (category_id)`;
}

// SQL kategori satırını API formatına çevir
function categoryRowToApi(row) {
  const legacy = row.legacy_json && typeof row.legacy_json === 'object' ? row.legacy_json : {};
  return {
    id: Number(row.id),
    name: row.name || legacy.name || '',
    description: legacy.description || '',
    icon: legacy.icon || null
  };
}

// SQL ürün satırını API formatına çevir
function itemRowToApi(row) {
  const legacy = row.legacy_json && typeof row.legacy_json === 'object' ? row.legacy_json : {};
  return {
    id: Number(row.id),
    categoryId: row.category_id != null ? Number(row.category_id) : legacy.categoryId,
    name: row.name || legacy.name || '',
    description: row.description || legacy.description || '',
    price: row.price != null ? Number(row.price) : legacy.price,
    featured: legacy.featured || false,
    best: legacy.best || false,
    image: row.image || legacy.image || null,
    tone: legacy.tone || null,
    imageUrl: legacy.imageUrl || legacy.image || row.image || null,
    active: row.active !== false
  };
}

// Menüyü SQL'den oku
export async function loadMenuFromSql(externalSql = null) {
  const sql = externalSql || getSql();
  if (!sql) return { categories: [], items: [] };

  await ensureMenuTables(sql);
  const categories = await sql`
    SELECT id, name, sort_order, legacy_json
    FROM menu_categories
    ORDER BY sort_order ASC, id ASC
  `;
  const items = await sql`
    SELECT id, category_id, name, price, description, image, lp_gain, active, legacy_json
    FROM menu_items
    WHERE active = true
    ORDER BY id ASC
  `;

  return {
    categories: categories.map(categoryRowToApi),
    items: items.map(itemRowToApi)
  };
}

// Menüyü SQL'e yaz — idempotent upsert
export async function upsertMenuToSql(categories = [], items = [], externalSql = null) {
  const sql = externalSql || getSql();
  if (!sql) return;

  await ensureMenuTables(sql);

  for (const [index, cat] of categories.entries()) {
    await sql`
      INSERT INTO menu_categories (id, name, sort_order, legacy_json)
      VALUES (${Number(cat.id)}, ${cat.name || ''}, ${index}, ${JSON.stringify(cat)})
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        sort_order = EXCLUDED.sort_order,
        legacy_json = EXCLUDED.legacy_json
    `;
  }

  for (const item of items) {
    await sql`
      INSERT INTO menu_items (id, category_id, name, price, description, image, lp_gain, active, legacy_json)
      VALUES (
        ${Number(item.id)},
        ${item.categoryId != null ? Number(item.categoryId) : null},
        ${item.name || ''},
        ${item.price != null ? Number(item.price) : null},
        ${item.description || null},
        ${item.image || item.imageUrl || null},
        ${item.lpGain != null ? Number(item.lpGain) : null},
        ${item.active !== false},
        ${JSON.stringify(item)}
      )
      ON CONFLICT (id) DO UPDATE SET
        category_id = EXCLUDED.category_id,
        name = EXCLUDED.name,
        price = EXCLUDED.price,
        description = EXCLUDED.description,
        image = EXCLUDED.image,
        lp_gain = EXCLUDED.lp_gain,
        active = EXCLUDED.active,
        legacy_json = EXCLUDED.legacy_json
    `;
  }
}
