-- Liberte Club — auth performans indexleri (BUG-021)
-- NON-DESTRUCTIVE. CONCURRENTLY tercihen tek statement olarak (txn disi) uygulanir.
-- Pooler/sql.unsafe icin IF NOT EXISTS formu kullanilir.

CREATE INDEX IF NOT EXISTS idx_auth_sessions_customer_id
  ON auth_sessions (customer_id);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at
  ON auth_sessions (expires_at);

CREATE INDEX IF NOT EXISTS idx_email_codes_email_created_at
  ON email_codes (email, created_at DESC);
