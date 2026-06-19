// Şema ensure — yalnızca geliştirme ortamında (production'da bootstrap SQL kullanılır)

let schemaReadyPromise = null;

function isProductionRuntime() {
  return process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
}

// Tek tek çalıştır — transaction pooler paralel DDL'de takılabilir
async function runSchemaEnsure(sql) {
  await sql`CREATE TABLE IF NOT EXISTS app_state (
    id text PRIMARY KEY,
    data jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS app_state_backups (
    id bigserial PRIMARY KEY,
    data jsonb NOT NULL,
    reason text NOT NULL DEFAULT 'auto',
    customer_count int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS auth_rate_limits (
    rate_key text PRIMARY KEY,
    hit_count int NOT NULL DEFAULT 0,
    window_start timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS email_codes (
    id bigserial PRIMARY KEY,
    email text NOT NULL,
    phone text NOT NULL,
    code text NOT NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS auth_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash text NOT NULL UNIQUE,
    customer_id bigint NOT NULL,
    role text NOT NULL DEFAULT 'user',
    admin_verified boolean NOT NULL DEFAULT false,
    device_id text,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS customer_pin_auth (
    phone text PRIMARY KEY,
    customer_id bigint NOT NULL,
    pin_hash text NOT NULL,
    pin_salt text NOT NULL,
    failed_attempts int NOT NULL DEFAULT 0,
    locked_until timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS customer_emails (
    email text PRIMARY KEY,
    customer_id bigint NOT NULL,
    phone text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS app_error_logs (
    id bigserial PRIMARY KEY,
    level text NOT NULL DEFAULT 'error',
    source text NOT NULL,
    message text NOT NULL,
    code text,
    detail jsonb,
    customer_id bigint,
    platform text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;

  await sql`ALTER TABLE email_codes ADD COLUMN IF NOT EXISTS code2 text`;
  await sql`ALTER TABLE email_codes ADD COLUMN IF NOT EXISTS attempts int NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE email_codes ADD COLUMN IF NOT EXISTS used boolean NOT NULL DEFAULT false`;
  await sql`ALTER TABLE email_codes ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'register'`;
  await sql`ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS admin_pin_failed int NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS admin_pin_locked_until timestamptz`;
  await sql`CREATE INDEX IF NOT EXISTS app_error_logs_created_at_idx
    ON app_error_logs (created_at DESC)`;
}

// Tablolar hazır mı — production'da atlanır (Supabase SQL bootstrap)
export async function ensureSchemaReady(sql) {
  if (!sql) return;
  if (isProductionRuntime()) return;

  if (!schemaReadyPromise) {
    schemaReadyPromise = runSchemaEnsure(sql).catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });
  }
  await schemaReadyPromise;
}

// Testler için önbelleği sıfırla
export function resetSchemaReadyCache() {
  schemaReadyPromise = null;
}
