-- Liberte Club — normalize PostgreSQL hedef şeması (hazırlık)
-- Production cutover YAPILMAZ; app_state.data legacy olarak kalır.
-- Çalıştırma: Neon SQL Editor veya migrate-jsonb-to-relational.mjs

CREATE TABLE IF NOT EXISTS schema_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now(),
  checksum text,
  notes text
);

CREATE TABLE IF NOT EXISTS entity_revisions (
  entity_type text NOT NULL,
  entity_id bigint NOT NULL,
  revision bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS customers (
  id bigint PRIMARY KEY,
  phone text NOT NULL,
  normalized_phone text,
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
CREATE INDEX IF NOT EXISTS idx_customers_normalized_phone ON customers (normalized_phone);

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
  id bigint PRIMARY KEY,
  customer_id bigint NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  category text,
  delta int,
  note text,
  menu_item_id bigint,
  menu_item_name text,
  created_at text,
  legacy_json jsonb
);

CREATE INDEX IF NOT EXISTS idx_loyalty_events_customer ON loyalty_events (customer_id);

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

CREATE TABLE IF NOT EXISTS campaigns (
  id bigint PRIMARY KEY,
  title text NOT NULL,
  body text,
  emoji text,
  active boolean NOT NULL DEFAULT true,
  legacy_json jsonb
);

CREATE TABLE IF NOT EXISTS daily_campaigns (
  id bigint PRIMARY KEY,
  title text NOT NULL,
  body text,
  emoji text,
  reward_type text,
  reward_value int,
  active boolean NOT NULL DEFAULT true,
  legacy_json jsonb
);

CREATE TABLE IF NOT EXISTS coupons (
  id bigint PRIMARY KEY,
  code text NOT NULL,
  title text,
  reward_type text,
  reward_value int,
  active boolean NOT NULL DEFAULT true,
  created_at text,
  legacy_json jsonb
);

CREATE TABLE IF NOT EXISTS coupon_uses (
  id bigint PRIMARY KEY,
  coupon_id bigint REFERENCES coupons(id) ON DELETE SET NULL,
  customer_id bigint REFERENCES customers(id) ON DELETE SET NULL,
  created_at text,
  legacy_json jsonb
);

CREATE TABLE IF NOT EXISTS check_ins (
  id bigint PRIMARY KEY,
  customer_id bigint REFERENCES customers(id) ON DELETE CASCADE,
  note text,
  created_at text,
  legacy_json jsonb
);

CREATE TABLE IF NOT EXISTS wheel_prizes (
  id bigint PRIMARY KEY,
  label text NOT NULL,
  prize_type text,
  prize_value int,
  weight int NOT NULL DEFAULT 0,
  legacy_json jsonb
);

CREATE TABLE IF NOT EXISTS wheel_spins (
  id bigint PRIMARY KEY,
  customer_id bigint REFERENCES customers(id) ON DELETE CASCADE,
  prize_id bigint REFERENCES wheel_prizes(id) ON DELETE SET NULL,
  created_at text,
  legacy_json jsonb
);

CREATE TABLE IF NOT EXISTS daily_claims (
  id bigint PRIMARY KEY,
  customer_id bigint REFERENCES customers(id) ON DELETE CASCADE,
  campaign_id bigint,
  created_at text,
  legacy_json jsonb
);

CREATE TABLE IF NOT EXISTS first_order_bonuses (
  id bigint PRIMARY KEY,
  customer_id bigint REFERENCES customers(id) ON DELETE CASCADE,
  name text,
  phone text,
  created_at text,
  legacy_json jsonb
);

CREATE TABLE IF NOT EXISTS referrals (
  id bigint PRIMARY KEY,
  referrer_id bigint REFERENCES customers(id) ON DELETE SET NULL,
  referred_id bigint REFERENCES customers(id) ON DELETE SET NULL,
  code text,
  created_at text,
  legacy_json jsonb
);

CREATE TABLE IF NOT EXISTS feedback (
  id bigint PRIMARY KEY,
  customer_id bigint REFERENCES customers(id) ON DELETE SET NULL,
  rating int,
  message text,
  created_at text,
  legacy_json jsonb
);

CREATE TABLE IF NOT EXISTS google_review_requests (
  id bigint PRIMARY KEY,
  customer_id bigint REFERENCES customers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  created_at text,
  approved_at text,
  rejected_at text,
  legacy_json jsonb
);

CREATE TABLE IF NOT EXISTS customer_notes (
  customer_id bigint PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  note text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS in_app_notifications (
  id bigint PRIMARY KEY,
  customer_id bigint REFERENCES customers(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  created_at text,
  legacy_json jsonb
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id bigint PRIMARY KEY,
  customer_id bigint REFERENCES customers(id) ON DELETE CASCADE,
  token text,
  channel text,
  platform text,
  device_id text,
  permission_status text NOT NULL DEFAULT 'unknown',
  app_version text,
  build_number text,
  active boolean NOT NULL DEFAULT true,
  created_at text,
  last_seen_at text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  legacy_json jsonb
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_customer ON push_subscriptions (customer_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_token ON push_subscriptions (token);

CREATE TABLE IF NOT EXISTS push_send_log (
  id bigint PRIMARY KEY,
  title text,
  body text,
  audience text,
  sent_count int,
  created_at text,
  legacy_json jsonb
);
