import { getCategoryLpGain } from './loyaltyPoints.js';

// Menü kategori ID → LP kategorisi eşlemesi (LP kazanmayan kategoriler hariç)
const MENU_CATEGORY_LP = {
  1: 'coffee',
  2: 'dessert',
  3: 'coffee',
  5: 'sandwich',
  6: 'burger'
};

// LP kazanmayan ürünler — kategori LP veriyor olsa bile
const MENU_ITEM_LP_EXCLUDE_IDS = new Set([68]);

// Ürün LP dışı mı kontrol et
export function isMenuItemLpExcluded(item) {
  if (!item) return true;
  if (MENU_ITEM_LP_EXCLUDE_IDS.has(Number(item.id))) return true;
  return /patates\s*tabağı/i.test(String(item.name || ''));
}

// Menü kategorisinin LP anahtarını döndür
export function getMenuCategoryLpKey(categoryId) {
  return MENU_CATEGORY_LP[Number(categoryId)] || null;
}

// LP kategorisine bağlı menü kategori ID'leri
export function getMenuCategoryIdsForLpCategory(lpCategory) {
  return Object.entries(MENU_CATEGORY_LP)
    .filter(([, key]) => key === lpCategory)
    .map(([id]) => Number(id));
}

// LP kategorisindeki menü ürünlerini listele
export function getMenuItemsForLpCategory(lpCategory, menuItems = []) {
  const categoryIds = new Set(getMenuCategoryIdsForLpCategory(lpCategory));
  return (menuItems || []).filter((item) => categoryIds.has(Number(item.categoryId)));
}

// Kasiyer — karışık LP durumu olan kategorilerde ürün seçimi gerekir (burger hariç: doğrudan +3 LP)
export function requiresProductPickForLpCategory(lpCategory, menuItems = []) {
  if (lpCategory === 'burger') return false;
  const items = getMenuItemsForLpCategory(lpCategory, menuItems);
  if (!items.length) return false;
  return items.some(isMenuItemLpExcluded);
}

// Ürünün LP kategori anahtarını döndür — LP dışıysa null
export function resolveMenuItemLpCategory(item) {
  if (isMenuItemLpExcluded(item)) return null;
  return getMenuCategoryLpKey(item?.categoryId);
}

// Kasiyer / sunucu — ürün LP kazanabilir mi doğrula
export function assertMenuItemCanEarnLp(item) {
  if (!item) {
    return { ok: false, error: 'Ürün seçilmedi' };
  }
  if (isMenuItemLpExcluded(item)) {
    return { ok: false, error: `${item.name} LP kazanmaz` };
  }
  const category = resolveMenuItemLpCategory(item);
  if (!category) {
    return { ok: false, error: 'Bu ürün LP kazandırmaz' };
  }
  return { ok: true, category, item };
}

// Menü kategorisinin LP kazancını döndür
export function getMenuCategoryLpGain(categoryId) {
  const key = getMenuCategoryLpKey(categoryId);
  return key ? getCategoryLpGain(key) : 0;
}

// Bölüm başlığı için LP etiketi
export function getMenuCategoryLpLabel(categoryId) {
  const gain = getMenuCategoryLpGain(categoryId);
  return gain ? `+${gain} LP` : '';
}

// Ürün satırı için LP etiketi
export function getMenuItemLpLabel(item) {
  if (isMenuItemLpExcluded(item)) return '';
  return getMenuCategoryLpLabel(item?.categoryId);
}
