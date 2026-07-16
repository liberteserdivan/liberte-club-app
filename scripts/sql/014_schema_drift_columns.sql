-- 014 - schema drift columns (BUG-018)

ALTER TABLE IF EXISTS in_app_notifications
  ADD COLUMN IF NOT EXISTS target_type text NOT NULL DEFAULT 'customer';
ALTER TABLE IF EXISTS in_app_notifications
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE IF EXISTS in_app_notifications
  ADD COLUMN IF NOT EXISTS read_at timestamptz;
ALTER TABLE IF EXISTS in_app_notifications
  ADD COLUMN IF NOT EXISTS payload jsonb;

CREATE INDEX IF NOT EXISTS idx_in_app_notifications_target
  ON in_app_notifications (target_type);

ALTER TABLE IF EXISTS customers
  ADD COLUMN IF NOT EXISTS referred_by bigint REFERENCES customers(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS daily_claims ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE IF EXISTS daily_claims ADD COLUMN IF NOT EXISTS day text;
ALTER TABLE IF EXISTS daily_claims ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE IF EXISTS daily_claims ADD COLUMN IF NOT EXISTS phone text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_claims_customer_type_day
  ON daily_claims (customer_id, type, day);
CREATE INDEX IF NOT EXISTS idx_daily_claims_customer_type
  ON daily_claims (customer_id, type);
