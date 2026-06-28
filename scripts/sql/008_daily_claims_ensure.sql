-- 008 — daily_claims tablosunu ve gerekli sütun/index'leri GÜVENLİ ve İDEMPOTENT ekler.
-- AMAÇ: Üretimde daily_claims tablosu hiç yoksa (migration 001 uygulanmamışsa)
-- günlük LP claim'i 503 DAILY_CLAIMS_TABLE_MISSING döner. Bu dosya tabloyu ve
-- (customer_id, type, day) tekilliğini eksiksiz, tekrar çalıştırılabilir biçimde kurar.
--
-- GÜVENLİK: Yalnızca CREATE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS kullanır.
--   - DROP yok, DELETE yok, TRUNCATE yok, veri değiştirme yok.
--   - Mevcut tabloya zarar vermez; varsa yalnızca eksik sütun/index tamamlanır.
--   - Tekrar tekrar çalıştırılabilir.
-- ÇALIŞTIRMA: Supabase/Neon SQL editöründe tek seferde çalıştırın.
-- NOT: Otomatik uygulanmaz — yalnızca check-daily-claims.sql NULL döndürürse uygulayın.

-- 1) Tablo (001_normalized_schema.sql ile aynı temel şema)
CREATE TABLE IF NOT EXISTS daily_claims (
  id bigint PRIMARY KEY,
  customer_id bigint REFERENCES customers(id) ON DELETE CASCADE,
  campaign_id bigint,
  created_at text,
  legacy_json jsonb
);

-- 2) Uygulamanın kullandığı ek sütunlar (005_daily_claims_dedup.sql ile aynı)
ALTER TABLE daily_claims ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE daily_claims ADD COLUMN IF NOT EXISTS day text;
ALTER TABLE daily_claims ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE daily_claims ADD COLUMN IF NOT EXISTS phone text;

-- 3) (customer_id, type, day) tekilliği — aynı gün ikinci claim'i engeller
CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_claims_customer_type_day
  ON daily_claims (customer_id, type, day);

CREATE INDEX IF NOT EXISTS idx_daily_claims_customer_type
  ON daily_claims (customer_id, type);

-- 4) Doğrulama (salt-okunur): NULL değilse tablo hazır demektir
select to_regclass('public.daily_claims') as daily_claims_ready;
