-- 005 — Günlük ödül (daily_claims) normalize + idempotent claim
-- AMAÇ: Günlük LP ödülü artık global app_state JSON blob'unu "FOR UPDATE" ile
-- kilitlemiyor. Claim'ler satır bazlı daily_claims tablosunda tutulur ve
-- (customer_id, type, day) tekilliği ile aynı gün ikinci claim engellenir.
-- Böylece farklı müşteriler eşzamanlı günlük claim yapabilir (global darboğaz yok).
--
-- ÇALIŞTIRMA: Neon/Supabase SQL editöründe sırayla.
-- Tablo 001_normalized_schema.sql ile zaten oluşturulmuş varsayılır; bu migration
-- yalnızca eksik sütun + tekillik indexini ekler (idempotent / tekrar çalıştırılabilir).

ALTER TABLE daily_claims ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE daily_claims ADD COLUMN IF NOT EXISTS day text;
ALTER TABLE daily_claims ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE daily_claims ADD COLUMN IF NOT EXISTS phone text;

-- (customer_id, type, day) tekilliği — aynı gün aynı tip claim'i engeller.
-- NULL day/type'lı eski (campaign_id tabanlı) satırlar NULL ayrımı nedeniyle
-- çakışmaz; uygulama okumaları zaten type/day NOT NULL filtreliyor.
CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_claims_customer_type_day
  ON daily_claims (customer_id, type, day);

CREATE INDEX IF NOT EXISTS idx_daily_claims_customer_type
  ON daily_claims (customer_id, type);

-- ---------------------------------------------------------------------------
-- BACKFILL (opsiyonel, idempotent): mevcut günlük claim'ler app_state JSON
-- blob'unun data->'dailyClaims' alanındaysa tabloya taşır. Tekrar çalıştırılabilir
-- (ON CONFLICT DO NOTHING). id alanı dolu kayıtlar alınır.
-- ---------------------------------------------------------------------------
-- INSERT INTO daily_claims (id, customer_id, type, day, name, phone, created_at)
-- SELECT
--   (c->>'id')::bigint,
--   (c->>'customerId')::bigint,
--   COALESCE(c->>'type', 'daily_login'),
--   c->>'day',
--   c->>'name',
--   c->>'phone',
--   c->>'createdAt'
-- FROM app_state s
-- CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.data->'dailyClaims', '[]'::jsonb)) AS c
-- WHERE s.id = 'liberte'
--   AND (c->>'id') IS NOT NULL
--   AND (c->>'customerId') IS NOT NULL
--   AND (c->>'day') IS NOT NULL
-- ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- ROLLBACK:
--   DROP INDEX IF EXISTS uq_daily_claims_customer_type_day;
--   DROP INDEX IF EXISTS idx_daily_claims_customer_type;
--   ALTER TABLE daily_claims DROP COLUMN IF EXISTS type;
--   ALTER TABLE daily_claims DROP COLUMN IF EXISTS day;
--   ALTER TABLE daily_claims DROP COLUMN IF EXISTS name;
--   ALTER TABLE daily_claims DROP COLUMN IF EXISTS phone;
--   (Tablo 001 şemasında zaten mevcut olduğundan tablo DROP edilmez.
--    Kod, claim okumalarını type/day filtreli yaptığı için rollback sonrası
--    günlük ödül akışı eski JSON davranışına dönmez; rollback yalnızca acil
--    durumda ve kod sürümü geri alındıktan sonra uygulanmalıdır.)
