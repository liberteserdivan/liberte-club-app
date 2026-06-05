// email_codes tablosu — eski Neon şemasına eksik sütunları ekle

export async function ensureEmailCodesTable(sql) {
  await sql`CREATE TABLE IF NOT EXISTS email_codes (
    id bigserial PRIMARY KEY,
    email text NOT NULL,
    phone text NOT NULL,
    code text NOT NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;

  await sql`ALTER TABLE email_codes ADD COLUMN IF NOT EXISTS code2 text`;
  await sql`ALTER TABLE email_codes ADD COLUMN IF NOT EXISTS attempts int NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE email_codes ADD COLUMN IF NOT EXISTS used boolean NOT NULL DEFAULT false`;
  await sql`ALTER TABLE email_codes ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'register'`;
  await sql`ALTER TABLE email_codes ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now()`;
}
