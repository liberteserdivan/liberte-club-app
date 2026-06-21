/** Terazi PLU satırlarını filtreler */
export function filterTeraziProducts(products) {
  return products.filter((p) => p.tartili && p.durum !== false);
}

/** Tartılı ürünler için PLU CSV üretir (CAS/TEM uyumlu genel format) */
export function buildTeraziCsv(rows) {
  const header = 'PLU;BARKOD;URUN_ADI;BIRIM_FIYAT;BIRIM';
  const lines = rows.map((row, index) => {
    const plu = String(row.id || index + 1);
    const price = Number(row.fiyat).toFixed(2).replace('.', ',');
    const name = sanitizeCsvField(row.adi);
    return `${plu};${row.barkod};${name};${price};${row.birim || 'KG'}`;
  });
  return `\uFEFF${header}\n${lines.join('\n')}`;
}

/** CSV alanındaki ayırıcı karakterleri temizler */
function sanitizeCsvField(value) {
  return String(value || '')
    .replace(/;/g, ',')
    .replace(/\r?\n/g, ' ')
    .trim();
}
