import { getSql } from './appState.js';
import { ensureEmailCodesTable } from './emailCodesSchema.js';

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

// Tek doğrulama kodu kaydet
async function storeVerificationCode(sql, { email, phone, purpose }) {
  const code = makeCode();

  await sql`INSERT INTO email_codes (email, phone, code, purpose, expires_at)
    VALUES (${email}, ${phone}, ${code}, ${purpose}, now() + interval '10 minutes')`;
  await sql`UPDATE email_codes SET used=true
    WHERE email=${email} AND phone=${phone} AND purpose=${purpose} AND code<>${code} AND used=false`;

  return code;
}

// Resend ile doğrulama e-postası gönder
async function dispatchVerificationEmail({ email, subject, greeting, code }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || 'Liberte <noreply@liberte.cafe>';
  const html = `<div style="font-family:Arial,sans-serif;background:#06110d;color:#fff;padding:28px;border-radius:18px">
    <h2 style="color:#b9f5d0">Liberte</h2>
    <p>${greeting}</p>
    <p>Doğrulama kodun:</p>
    <div style="font-size:34px;letter-spacing:8px;font-weight:800;color:#b9f5d0;margin:18px 0">${code}</div>
    <p>Bu kod 10 dakika geçerlidir.</p>
  </div>`;

  if (!apiKey) {
    if (isProduction()) {
      return { ok: false, status: 503, error: 'E-posta servisi yapılandırılmadı.' };
    }
    return {
      ok: true,
      testCode: code,
      warning: 'Geliştirme modu — test kodu yalnızca dev ortamında.'
    };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from, to: email, subject, html }),
    signal: AbortSignal.timeout(10000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, status: 500, error: payload.message || 'E-posta gönderilemedi' };
  }

  return { ok: true };
}

// Doğrulama kodu oluştur, kaydet ve e-posta gönder
export async function sendVerificationCode({
  email,
  phone,
  purpose,
  subject,
  greeting
}) {
  try {
    const sql = getSql();
    if (!sql) {
      return { ok: false, status: 500, error: 'DATABASE_URL eksik' };
    }
    await ensureEmailCodesTable(sql);

    const code = await storeVerificationCode(sql, { email, phone, purpose });
    const sent = await dispatchVerificationEmail({ email, subject, greeting, code });

    if (!sent.ok) {
      return sent;
    }

    return {
      ok: true,
      emailMasked: maskEmail(email),
      testCode: sent.testCode,
      warning: sent.warning
    };
  } catch (e) {
    return { ok: false, status: 500, error: e.message || 'Doğrulama kodu gönderilemedi' };
  }
}

// Geriye uyumluluk
export const sendDualVerificationCodes = sendVerificationCode;
