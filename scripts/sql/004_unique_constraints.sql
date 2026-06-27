-- Liberte Club — benzersizlik (unique) kısıtları ve replay tablosu
-- Çalıştırma: Supabase SQL Editor (tek sefer). Tekrar çalıştırmak güvenlidir.
--
-- ÖNEMLİ: Mevcut kayıtlarda yinelenen (duplicate) değerler varsa, ilgili unique index
-- OLUŞTURULMAZ ve bir NOTICE basılır (deploy KIRILMAZ). O durumda önce duplicate'ler
-- temizlenmeli, sonra bu migration yeniden çalıştırılmalıdır.

-- ---------------------------------------------------------------------------
-- 0) QR replay koruması tablosu (idempotent)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS qr_used_tokens (
  nonce text NOT NULL,
  action text NOT NULL,
  customer_id bigint,
  used_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (nonce, action)
);
CREATE INDEX IF NOT EXISTS idx_qr_used_tokens_used_at ON qr_used_tokens (used_at);

-- ---------------------------------------------------------------------------
-- 1) customers.normalized_phone — benzersiz (NULL hariç)
--    Aynı telefonla mükerrer kayıt (duplicate register race) engellenir.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  dup_count int;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT normalized_phone
    FROM customers
    WHERE normalized_phone IS NOT NULL
    GROUP BY normalized_phone
    HAVING count(*) > 1
  ) d;

  IF dup_count = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS ux_customers_normalized_phone
      ON customers (normalized_phone)
      WHERE normalized_phone IS NOT NULL;
  ELSE
    RAISE NOTICE 'ux_customers_normalized_phone ATLANDI: % yinelenen normalized_phone var. Önce dedup yapın.', dup_count;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) customers.referral_code — benzersiz (büyük harf normalize, NULL hariç)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  dup_count int;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT upper(referral_code) AS rc
    FROM customers
    WHERE referral_code IS NOT NULL
    GROUP BY upper(referral_code)
    HAVING count(*) > 1
  ) d;

  IF dup_count = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS ux_customers_referral_code
      ON customers (upper(referral_code))
      WHERE referral_code IS NOT NULL;
  ELSE
    RAISE NOTICE 'ux_customers_referral_code ATLANDI: % yinelenen referral_code var. Önce dedup yapın.', dup_count;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3) push_subscriptions.token — benzersiz (NULL hariç)
--    Aynı cihaz tokenı için tek aktif kayıt.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  dup_count int;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT token
    FROM push_subscriptions
    WHERE token IS NOT NULL
    GROUP BY token
    HAVING count(*) > 1
  ) d;

  IF dup_count = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS ux_push_subscriptions_token
      ON push_subscriptions (token)
      WHERE token IS NOT NULL;
  ELSE
    RAISE NOTICE 'ux_push_subscriptions_token ATLANDI: % yinelenen token var. Önce dedup yapın.', dup_count;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4) Zaten mevcut benzersizlikler (referans — değişiklik gerekmez):
--    auth_sessions.token_hash  → UNIQUE (000_supabase_bootstrap.sql)
--    customer_pin_auth.phone   → PRIMARY KEY
--    customer_emails.email     → PRIMARY KEY
-- ---------------------------------------------------------------------------
