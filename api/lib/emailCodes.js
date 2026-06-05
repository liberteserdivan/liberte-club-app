// E-posta doğrulama kodları — deneme sayısı ve süre kontrolü

function normalizeCode(v = '') {
  return String(v || '').replace(/\D/g, '');
}

// Aktif kod satırını bul
async function findActiveCode(sql, { email, phone, purpose }) {
  const rows = await sql`
    SELECT id, code, attempts, expires_at, used, phone, purpose
    FROM email_codes
    WHERE email = ${email}
      AND purpose = ${purpose}
      AND used = false
      AND expires_at > now()
    ORDER BY created_at DESC
    LIMIT 10
  `;

  if (phone) {
    const byPhone = rows.find((item) => String(item.phone) === String(phone));
    if (byPhone) return byPhone;
  }

  return rows[0] || null;
}

// Kodu doğrula — hatalı denemelerde attempts artır
export async function verifyEmailCode(sql, { email, phone, code, purpose = 'register' }) {
  await sql`CREATE TABLE IF NOT EXISTS email_codes (
    id bigserial PRIMARY KEY,
    email text NOT NULL,
    phone text NOT NULL,
    code text NOT NULL,
    attempts int NOT NULL DEFAULT 0,
    used boolean NOT NULL DEFAULT false,
    purpose text NOT NULL DEFAULT 'register',
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;

  const row = await findActiveCode(sql, { email, phone, purpose });
  if (!row) {
    return { ok: false, status: 400, error: 'Aktif kod bulunamadı. Yeni kod iste.' };
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    await sql`UPDATE email_codes SET used = true WHERE id = ${row.id}`;
    return { ok: false, status: 400, error: 'Kod süresi doldu. Yeni kod iste.' };
  }

  if (row.attempts >= 5) {
    await sql`UPDATE email_codes SET used = true WHERE id = ${row.id}`;
    return { ok: false, status: 429, error: 'Çok fazla deneme. Yeni kod iste.' };
  }

  if (normalizeCode(row.code) !== normalizeCode(code)) {
    const nextAttempts = Number(row.attempts || 0) + 1;
    const exhausted = nextAttempts >= 5;
    await sql`
      UPDATE email_codes
      SET attempts = ${nextAttempts}, used = ${exhausted}
      WHERE id = ${row.id}
    `;
    if (exhausted) {
      return { ok: false, status: 429, error: 'Çok fazla deneme. Yeni kod iste.' };
    }
    return { ok: false, status: 400, error: 'Kod hatalı' };
  }

  await sql`UPDATE email_codes SET used = true WHERE id = ${row.id}`;
  return { ok: true, row };
}
