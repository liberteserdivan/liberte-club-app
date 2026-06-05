import { neon } from '@neondatabase/serverless';

function makeCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function maskEmail(value = '') {
  const em = String(value).trim().toLowerCase();
  const [local, domain] = em.split('@');
  if (!local || !domain) return em;
  if (local.length <= 2) return `${local[0] || '*'}***@${domain}`;
  return `${local[0]}***${local.slice(-1)}@${domain}`;
}

function isProduction() {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
}

// E-posta kodları tablosunu hazırla
async function ensureEmailCodesTable(sql) {
  await sql`CREATE TABLE IF NOT EXISTS email_codes (
    id bigserial PRIMARY KEY,
    email text NOT NULL,
    phone text NOT NULL,
    code text NOT NULL,
    code2 text,
    attempts int NOT NULL DEFAULT 0,
    used boolean NOT NULL DEFAULT false,
    purpose text NOT NULL DEFAULT 'register',
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`ALTER TABLE email_codes ADD COLUMN IF NOT EXISTS code2 text`;
}

// İki doğrulama kodu üret ve kaydet
async function storeDualCodes(sql, { email, phone, purpose }) {
  const code = makeCode();
  const code2 = makeCode();

  await sql`INSERT INTO email_codes (email, phone, code, code2, purpose, expires_at)
    VALUES (${email}, ${phone}, ${code}, ${code2}, ${purpose}, now() + interval '10 minutes')`;
  await sql`UPDATE email_codes SET used=true
    WHERE email=${email} AND phone=${phone} AND purpose=${purpose} AND code<>${code} AND used=false`;

  return { code, code2 };
}

// Resend ile çift kodlu doğrulama e-postası gönder
async function dispatchDualCodeEmail({ email, subject, greeting, code, code2 }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || 'Liberte <noreply@liberte.cafe>';
  const html = `<div style="font-family:Arial,sans-serif;background:#06110d;color:#fff;padding:28px;border-radius:18px">
    <h2 style="color:#b9f5d0">Liberte</h2>
    <p>${greeting}</p>
    <p>İki doğrulama kodunu uygulamaya gir:</p>
    <p style="margin:12px 0 4px;color:#b9f5d0;font-weight:700">Kod 1</p>
    <div style="font-size:32px;letter-spacing:6px;font-weight:800;color:#b9f5d0;margin:0 0 16px">${code}</div>
    <p style="margin:12px 0 4px;color:#b9f5d0;font-weight:700">Kod 2</p>
    <div style="font-size:32px;letter-spacing:6px;font-weight:800;color:#b9f5d0;margin:0 0 16px">${code2}</div>
    <p>Kodlar 10 dakika geçerlidir.</p>
  </div>`;

  if (!apiKey) {
    if (isProduction()) {
      return { ok: false, status: 503, error: 'E-posta servisi yapılandırılmadı.' };
    }
    return {
      ok: true,
      testCode: code,
      testCode2: code2,
      warning: 'Geliştirme modu — test kodları yalnızca dev ortamında.'
    };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from, to: email, subject, html })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, status: 500, error: payload.message || 'E-posta gönderilemedi' };
  }

  return { ok: true };
}

// Çift kod oluştur, kaydet ve e-posta gönder
export async function sendDualVerificationCodes({
  email,
  phone,
  purpose,
  subject,
  greeting
}) {
  if (!process.env.DATABASE_URL) {
    return { ok: false, status: 500, error: 'DATABASE_URL eksik' };
  }

  const sql = neon(process.env.DATABASE_URL);
  await ensureEmailCodesTable(sql);

  const { code, code2 } = await storeDualCodes(sql, { email, phone, purpose });
  const sent = await dispatchDualCodeEmail({ email, subject, greeting, code, code2 });

  if (!sent.ok) {
    return sent;
  }

  return {
    ok: true,
    emailMasked: maskEmail(email),
    testCode: sent.testCode,
    testCode2: sent.testCode2,
    warning: sent.warning
  };
}
