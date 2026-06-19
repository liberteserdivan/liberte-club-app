-- Liberte Club — Supabase ilk kurulum (SQL Editor'da tek sefer çalıştır)
-- Production cutover YAPILMAZ; app_state.data legacy JSONB olarak kalır.
-- Normalize tablolar yalnızca ilerideki realtime / migration hazırlığı içindir.

-- ---------------------------------------------------------------------------
-- Çekirdek operasyonel tablolar (mevcut API lazy migration ile uyumlu)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app_state (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_state_backups (
  id bigserial PRIMARY KEY,
  data jsonb NOT NULL,
  reason text NOT NULL DEFAULT 'auto',
  customer_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  customer_id bigint NOT NULL,
  role text NOT NULL DEFAULT 'user',
  admin_verified boolean NOT NULL DEFAULT false,
  device_id text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS admin_pin_failed int NOT NULL DEFAULT 0;
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS admin_pin_locked_until timestamptz;

CREATE TABLE IF NOT EXISTS customer_pin_auth (
  phone text PRIMARY KEY,
  customer_id bigint NOT NULL,
  pin_hash text NOT NULL,
  pin_salt text NOT NULL,
  failed_attempts int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_emails (
  email text PRIMARY KEY,
  customer_id bigint NOT NULL,
  phone text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_codes (
  id bigserial PRIMARY KEY,
  email text NOT NULL,
  phone text NOT NULL,
  code text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  used boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE email_codes ADD COLUMN IF NOT EXISTS code2 text;
ALTER TABLE email_codes ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'register';

CREATE TABLE IF NOT EXISTS app_error_logs (
  id bigserial PRIMARY KEY,
  level text NOT NULL DEFAULT 'error',
  source text NOT NULL,
  message text NOT NULL,
  code text,
  detail jsonb,
  customer_id bigint,
  platform text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_error_logs_created_at_idx
  ON app_error_logs (created_at DESC);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  rate_key text PRIMARY KEY,
  hit_count int NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Realtime / normalize hazırlık (henüz production yazım yolu değil)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS customers (
  id bigint PRIMARY KEY,
  phone text NOT NULL,
  name text NOT NULL,
  email text,
  birth_date text,
  referral_code text,
  is_admin boolean NOT NULL DEFAULT false,
  created_at text,
  last_visit text,
  legacy_json jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers (phone);

CREATE TABLE IF NOT EXISTS customer_loyalty (
  customer_id bigint PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  total_stamps int NOT NULL DEFAULT 0,
  lifetime_stamps int NOT NULL DEFAULT 0,
  available_rewards int NOT NULL DEFAULT 0,
  used_rewards int NOT NULL DEFAULT 0,
  level text,
  category_stamps jsonb NOT NULL DEFAULT '{}'::jsonb,
  category_rewards jsonb NOT NULL DEFAULT '{}'::jsonb,
  lp_balance int,
  lp_lifetime int,
  lp_schema_version int,
  legacy_json jsonb,
  revision bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loyalty_events (
  id bigserial PRIMARY KEY,
  customer_id bigint NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  category text,
  delta int,
  note text,
  menu_item_id bigint,
  menu_item_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  legacy_json jsonb
);

CREATE INDEX IF NOT EXISTS idx_loyalty_events_customer
  ON loyalty_events (customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS menu_categories (
  id bigint PRIMARY KEY,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  legacy_json jsonb
);

CREATE TABLE IF NOT EXISTS menu_items (
  id bigint PRIMARY KEY,
  category_id bigint REFERENCES menu_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  price numeric,
  description text,
  image text,
  lp_gain int,
  active boolean NOT NULL DEFAULT true,
  legacy_json jsonb
);

CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items (category_id);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id bigint PRIMARY KEY,
  customer_id bigint REFERENCES customers(id) ON DELETE CASCADE,
  token text NOT NULL,
  channel text,
  platform text,
  active boolean NOT NULL DEFAULT true,
  created_at text,
  legacy_json jsonb
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_customer ON push_subscriptions (customer_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_token ON push_subscriptions (token);

-- ---------------------------------------------------------------------------
-- Supabase Realtime publication (ileride client bağlanınca)
-- Not: RLS + Supabase Auth kullanılmıyor; canlı abonelik ayrı tasarlanacak.
-- ---------------------------------------------------------------------------

-- ALTER PUBLICATION supabase_realtime ADD TABLE customer_loyalty;
-- ALTER PUBLICATION supabase_realtime ADD TABLE loyalty_events;
