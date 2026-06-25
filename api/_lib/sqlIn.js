// Supabase transaction pooler (prepare:false) — ANY(${dizi}) malformed.array literal verir
// postgres.js IN ${sql(list)} formatı pooler ile uyumludur

// Boş liste için eşleşmeyen placeholder — sorguyu geçersiz kılmadan çalıştırır
const NO_MATCH = '__liberte_no_match__';

// SQL IN listesi — postgres tagged template döndürür
export function inList(sql, values) {
  const items = Array.isArray(values)
    ? values.map((v) => String(v)).filter((v) => v.length > 0)
    : [];
  return sql(items.length ? items : [NO_MATCH]);
}
