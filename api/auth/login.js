import { neon } from '@neondatabase/serverless';
import { applyCors, readBody } from '../lib/http.js';
import { cleanPhone } from '../lib/phone.js';
import {
  createSession,
  findCustomerByPhone,
  getSession,
  readAuthToken
} from '../lib/auth.js';

function validEmail(v = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).toLowerCase());
}

function makeCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function maskEmail(value = '') {
  const em = String(value).trim().toLowerCase();
  const [local, domain] = em.split('@');
  if (!local || !domain) return em;
  if (local.length <= 2) return `${local[0] || '*'}***@${domain}`;
  return `${local[0]}***${local.slice(-1)}@${domain}`;
}

function isProduction() {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
}

// Giriş — oturum varsa OTP isteme, yoksa e-posta kodu gönder
export default async function handler(req, res) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = readBody(req);
    const phone = cleanPhone(body.phone);
    const deviceId = String(body.deviceId || '').trim();

    if (phone.length < 10) return res.status(400).json({ error: 'Telefon eksik' });
    if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'DATABASE_URL eksik' });

    const customer = await findCustomerByPhone(phone);
    if (!customer) {
      return res.status(404).json({ error: 'Bu telefon ile kayıt bulunamadı. Önce kayıt olun.' });
    }

    const existing = await getSession(req);
    if (existing && Number(existing.customerId) === Number(customer.id) && readAuthToken(req)) {
      return res.status(200).json({
        ok: true,
        needsOtp: false,
        customerId: customer.id,
        role: existing.role,
        isAdmin: existing.isAdmin,
        adminVerified: existing.adminVerified
      });
    }

    const email = String(customer.email || '').trim().toLowerCase();
    if (!validEmail(email)) {
      return res.status(400).json({ error: 'Hesabınızda geçerli e-posta yok. Destek ile iletişime geçin.' });
    }

    const sql = neon(process.env.DATABASE_URL);
    await sql`CREATE TABLE IF NOT EXISTS email_codes (
      id bigserial PRIMARY KEY,
      email text NOT NULL,
      phone text NOT NULL,
      code text NOT NULL,
      attempts int NOT NULL DEFAULT 0,
      used boolean NOT NULL DEFAULT false,
      purpose text NOT NULL DEFAULT 'login',
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;

    const code = makeCode();
    await sql`INSERT INTO email_codes (email, phone, code, purpose, expires_at)
      VALUES (${email}, ${phone}, ${code}, 'login', now() + interval '10 minutes')`;
    await sql`UPDATE email_codes SET used=true
      WHERE email=${email} AND phone=${phone} AND purpose='login' AND code<>${code} AND used=false`;

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL || 'Liberte <noreply@liberte.cafe>';
    const subject = 'Liberte giriş kodun';
    const html = `<div style="font-family:Arial,sans-serif;background:#06110d;color:#fff;padding:28px;border-radius:18px"><h2 style="color:#b9f5d0">Liberte</h2><p>Merhaba ${customer.name},</p><p>Yeni cihaz giriş kodun:</p><div style="font-size:34px;letter-spacing:8px;font-weight:800;color:#b9f5d0;margin:18px 0">${code}</div><p>Bu kod 10 dakika geçerlidir.</p></div>`;

    if (apiKey) {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ from, to: email, subject, html })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return res.status(500).json({ error: j.message || 'E-posta gönderilemedi' });
      return res.status(200).json({
        ok: true,
        needsOtp: true,
        emailMasked: maskEmail(email)
      });
    }

    if (isProduction()) {
      return res.status(503).json({ error: 'E-posta servisi yapılandırılmadı. Lütfen daha sonra tekrar dene.' });
    }

    return res.status(200).json({
      ok: true,
      needsOtp: true,
      emailMasked: maskEmail(email),
      testCode: code,
      warning: 'Geliştirme modu — test kodu yalnızca dev ortamında.'
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Giriş başlatılamadı' });
  }
}
