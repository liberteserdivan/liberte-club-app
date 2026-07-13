// Boş liste için eşleşmeyen placeholder
const NO_MATCH = '__liberte_no_match__';

// SQL IN listesi — postgres tagged template
export function inList(sql, values) {
  const items = Array.isArray(values)
    ? values.map((v) => String(v)).filter((v) => v.length > 0)
    : [];
  return sql(items.length ? items : [NO_MATCH]);
}
