/** SQL olmadan geliştirme için örnek stok verisi */
const seedProducts = [
  {
    id: 1,
    kodu: 'PEYNIR001',
    adi: 'Tam Yağlı Beyaz Peynir',
    barkod: '2700001000001',
    fiyat: 285,
    birim: 'KG',
    tartili: true,
    kdvId: 2,
    durum: true,
    sonDegisiklik: new Date().toISOString()
  },
  {
    id: 2,
    kodu: 'ZEYTIN001',
    adi: 'Siyah İncir Zeytin',
    barkod: '2700002000001',
    fiyat: 195,
    birim: 'KG',
    tartili: true,
    kdvId: 2,
    durum: true,
    sonDegisiklik: new Date().toISOString()
  },
  {
    id: 3,
    kodu: 'SU500',
    adi: 'Su 500ml',
    barkod: '8690000000001',
    fiyat: 15,
    birim: 'ADET',
    tartili: false,
    kdvId: 2,
    durum: true,
    sonDegisiklik: new Date().toISOString()
  }
];

let products = structuredClone(seedProducts);
let nextId = 4;
const syncLog = [];

/** Mock ürün listesini döner */
export function mockListProducts({ q = '', tartiliOnly = false } = {}) {
  const term = String(q).trim().toLowerCase();
  return products.filter((p) => {
    if (tartiliOnly && !p.tartili) return false;
    if (!term) return true;
    return (
      p.kodu.toLowerCase().includes(term) ||
      p.adi.toLowerCase().includes(term) ||
      p.barkod.includes(term)
    );
  });
}

/** Mock ürün ekler */
export function mockCreateProduct(payload) {
  const item = {
    id: nextId++,
    kodu: payload.kodu,
    adi: payload.adi,
    barkod: payload.barkod,
    fiyat: payload.fiyat,
    birim: payload.birim,
    tartili: Boolean(payload.tartili),
    kdvId: payload.kdvId ?? 2,
    durum: true,
    sonDegisiklik: new Date().toISOString()
  };
  products.push(item);
  return item;
}

/** Mock ürün günceller */
export function mockUpdateProduct(id, payload) {
  const idx = products.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  products[idx] = {
    ...products[idx],
    ...payload,
    id,
    sonDegisiklik: new Date().toISOString()
  };
  return products[idx];
}

/** Mock toplu fiyat günceller */
export function mockBulkPriceUpdate({ ids, mode, value }) {
  const idSet = new Set(ids);
  let count = 0;
  products = products.map((p) => {
    if (!idSet.has(p.id)) return p;
    const next = { ...p, fiyat: applyPriceChange(p.fiyat, mode, value) };
    next.sonDegisiklik = new Date().toISOString();
    count++;
    return next;
  });
  return count;
}

/** Mock senkron kaydı ekler */
export function mockRecordSync(type, detail) {
  const entry = { type, detail, at: new Date().toISOString() };
  syncLog.unshift(entry);
  return entry;
}

/** Mock senkron geçmişi */
export function mockSyncHistory() {
  return syncLog.slice(0, 20);
}

/** Fiyat değişim hesabı */
function applyPriceChange(current, mode, value) {
  const v = Number(value);
  if (mode === 'percent') return roundPrice(current * (1 + v / 100));
  if (mode === 'fixed') return roundPrice(v);
  if (mode === 'add') return roundPrice(current + v);
  return current;
}

/** Fiyatı 2 haneye yuvarlar */
function roundPrice(n) {
  return Math.round(Number(n) * 100) / 100;
}

export { applyPriceChange, roundPrice };
