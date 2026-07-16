// Diziyi sabit boyutlu parçalara böl. Tek iş: parçalama.
// RB-3: Çok üyeli işletmelerde tek sorguda binlerce satır göndermek Postgres
// parametre limitine (65535) takılabilir veya devasa sorgu/transaction üretir.
// Toplu upsert'ler bu yardımcıyla parça parça (örn. 500'lük) yazılır.
export function chunkArray(items, size = 500) {
  const list = Array.isArray(items) ? items : [];
  const safeSize = Number(size) > 0 ? Number(size) : 500;
  if (list.length <= safeSize) return list.length ? [list] : [];

  const chunks = [];
  for (let i = 0; i < list.length; i += safeSize) {
    chunks.push(list.slice(i, i + safeSize));
  }
  return chunks;
}
