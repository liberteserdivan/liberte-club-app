-- 006_guardian.sql
-- Liberte Guardian — OPSİYONEL kalıcı depolama (v2)
--
-- ÖNEMLİ: Guardian v1 tamamen bellek tabanlı çalışır (lambda ömrü kadar).
-- Bu migration ZORUNLU DEĞİLDİR ve Guardian tarafından OTOMATİK UYGULANMAZ.
-- Yalnızca incident/safe-mode durumunun lambda instance'ları arasında kalıcı
-- olması istenirse, yönetici tarafından MANUEL olarak uygulanmalıdır.
--
-- Tüm ifadeler additive ve idempotent'tir (IF NOT EXISTS). Mevcut veriyi silmez,
-- değiştirmez. Riskli bir işlem içermez.

-- Safe Mode tek satırlık config
CREATE TABLE IF NOT EXISTS guardian_safe_mode (
  id text PRIMARY KEY DEFAULT 'singleton',
  config jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Incident kayıtları (dedup anahtarı uygulama tarafından yönetilir)
CREATE TABLE IF NOT EXISTS guardian_incidents (
  id text PRIMARY KEY,
  level text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  title text,
  affected_area text,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  requires_human boolean NOT NULL DEFAULT false,
  data jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guardian_incidents_status
  ON guardian_incidents (status, last_seen_at DESC);

-- (Opsiyonel) Metrik olay arşivi — yüksek hacimli olabilir; v2'de değerlendirilir.
-- CREATE TABLE IF NOT EXISTS guardian_events (
--   id bigserial PRIMARY KEY,
--   ts timestamptz NOT NULL DEFAULT now(),
--   service text,
--   endpoint text,
--   method text,
--   duration_ms integer,
--   status integer,
--   request_id text
-- );

-- ROLLBACK NOTU (geri alma):
--   DROP INDEX IF EXISTS idx_guardian_incidents_status;
--   DROP TABLE IF EXISTS guardian_incidents;
--   DROP TABLE IF EXISTS guardian_safe_mode;
--   -- (guardian_events açılmışsa: DROP TABLE IF EXISTS guardian_events;)
-- Bu tablolar yalnızca Guardian gözlemlenebilirliği içindir; uygulama iş
-- mantığı bunlara bağımlı değildir. Geri alınması uygulamayı etkilemez.
