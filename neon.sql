CREATE TABLE IF NOT EXISTS app_state (id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS email_codes (id bigserial PRIMARY KEY,email text NOT NULL,phone text NOT NULL,code text NOT NULL,attempts int NOT NULL DEFAULT 0,used boolean NOT NULL DEFAULT false,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS app_error_logs (id bigserial PRIMARY KEY, level text NOT NULL DEFAULT 'error', source text NOT NULL, message text NOT NULL, code text, detail jsonb, customer_id bigint, platform text, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS app_error_logs_created_at_idx ON app_error_logs (created_at DESC);
