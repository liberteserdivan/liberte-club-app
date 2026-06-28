// Günlük ödül (daily_claims) satır deposu.
// Önceden günlük claim'ler global app_state JSON blob'unda tutulup tüm blob
// "FOR UPDATE" ile kilitleniyordu (her claim global darboğaz yaratıyordu).
// Burada claim'ler normalize tabloda, (customer_id, type, day) tekilliğiyle
// tutulur; böylece farklı müşteriler eşzamanlı claim yapabilir.

// Şema garantisi süreç başına bir kez yapılır (idempotent ALTER/INDEX).
let schemaReadyPromise = null;

// type/day sütunlarını ve (customer_id, type, day) tekilliğini garanti et.
// Migration (005) zaten uygulanmışsa bu çağrılar no-op olur.
export async function ensureDailyClaimsSchema(sql) {
  if (schemaReadyPromise) return schemaReadyPromise;
  schemaReadyPromise = (async () => {
    await sql`ALTER TABLE daily_claims ADD COLUMN IF NOT EXISTS type text`;
    await sql`ALTER TABLE daily_claims ADD COLUMN IF NOT EXISTS day text`;
    await sql`ALTER TABLE daily_claims ADD COLUMN IF NOT EXISTS name text`;
    await sql`ALTER TABLE daily_claims ADD COLUMN IF NOT EXISTS phone text`;
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_claims_customer_type_day
      ON daily_claims (customer_id, type, day)
    `;
  })().catch((error) => {
    // Hata olursa sonraki istek tekrar denesin
    schemaReadyPromise = null;
    throw error;
  });
  return schemaReadyPromise;
}

// SQL satırını istemci kaydına çevir (tek iş)
export function dailyClaimRowToRecord(row) {
  return {
    id: Number(row.id),
    customerId: Number(row.customer_id),
    type: row.type,
    day: row.day,
    name: row.name ?? null,
    phone: row.phone ?? null,
    createdAt: row.created_at ?? null
  };
}

// Bir müşterinin claim kayıtları — opsiyonel tip filtresiyle
export async function loadDailyClaimsForCustomer(sql, customerId, type = null) {
  const id = Number(customerId);
  const rows = type
    ? await sql`
        SELECT id, customer_id, type, day, name, phone, created_at
        FROM daily_claims
        WHERE customer_id = ${id} AND type = ${type} AND day IS NOT NULL
        ORDER BY day DESC
      `
    : await sql`
        SELECT id, customer_id, type, day, name, phone, created_at
        FROM daily_claims
        WHERE customer_id = ${id} AND type IS NOT NULL AND day IS NOT NULL
        ORDER BY day DESC
      `;
  return rows.map(dailyClaimRowToRecord);
}

// Tüm claim kayıtları — admin tam state birleştirmesi için
export async function loadAllDailyClaims(sql) {
  const rows = await sql`
    SELECT id, customer_id, type, day, name, phone, created_at
    FROM daily_claims
    WHERE type IS NOT NULL AND day IS NOT NULL
    ORDER BY day DESC
  `;
  return rows.map(dailyClaimRowToRecord);
}

// Idempotent claim ekle — (customer_id, type, day) çakışırsa eklenmez.
// Dönüş: eklendiyse true, bugün zaten alınmışsa false.
export async function insertDailyClaim(sql, claim) {
  const rows = await sql`
    INSERT INTO daily_claims (id, customer_id, type, day, name, phone, created_at)
    VALUES (
      ${claim.id}, ${claim.customerId}, ${claim.type}, ${claim.day},
      ${claim.name ?? null}, ${claim.phone ?? null}, ${claim.createdAt}
    )
    ON CONFLICT (customer_id, type, day) DO NOTHING
    RETURNING id
  `;
  return rows.length > 0;
}

// Test/yeniden kullanım için şema önbelleğini sıfırla
export function resetDailyClaimsSchemaCache() {
  schemaReadyPromise = null;
}
