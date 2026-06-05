import { neon } from '@neondatabase/serverless';
import { applyCors, readBody } from '../lib/http.js';
import { cleanPhone } from '../lib/phone.js';
import { findCustomerByPhone } from '../lib/auth.js';
import { verifyEmailCode } from '../lib/emailCodes.js';
import {
  isValidPinFormat,
  normalizePin,
  saveCustomerPin
} from '../lib/pinAuth.js';

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

// PIN unutma — e-posta doğrulama kodu gönder
async function handleSendCode(req, res) {
  const body = readBody(req);
  const phone = cleanPhone(body.phone);

  if (phone.length < 10) return res.status(400).json({ error: 'Telefon eksik' });
  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'DATABASE_URL eksik' });

  const customer = await findCustomerByPhone(phone);
  if (!customer) {
    return res.status(404).json({ error: 'Bu telefon ile kayıt bulunamadı.' });
  }

  const email = String(customer.email || '').trim().toLowerCase();
  if (!validEmail(email)) {
    return res.status(400).json({ error: 'Hesapta geçerli e-posta yok. Destek ile iletişime geç.' });
  }

  const sql = neon(process.env.DATABASE_URL);
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

  const code = makeCode();
  await sql`INSERT INTO email_codes (email, phone, code, purpose, expires_at)
    VALUES (${email}, ${phone}, ${code}, 'pin_reset', now() + interval '10 minutes')`;
  await sql`UPDATE email_codes SET used=true
    WHERE email=${email} AND phone=${phone} AND purpose='pin_reset' AND code<>${code} AND used=false`;

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || 'Liberte <noreply@liberte.cafe>';
  const subject = 'Liberte PIN sıfırlama kodun';
  const html = `<div style="font-family:Arial,sans-serif;background:#06110d;color:#fff;padding:28px;border-radius:18px"><h2 style="color:#b9f5d0">Liberte</h2><p>Merhaba ${customer.name},</p><p>PIN sıfırlama kodun:</p><div style="font-size:34px;letter-spacing:8px;font-weight:800;color:#b9f5d0;margin:18px 0">${code}</div><p>Bu kod 10 dakika geçerlidir.</p></div>`;

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
    return res.status(200).json({ ok: true, emailMasked: maskEmail(email) });
  }

  if (isProduction()) {
    return res.status(503).json({ error: 'E-posta servisi yapılandırılmadı.' });
  }

  return res.status(200).json({
    ok: true,
    emailMasked: maskEmail(email),
    testCode: code,
    warning: 'Geliştirme modu — test kodu yalnızca dev ortamında.'
  });
}

// PIN unutma — kod doğrula ve yeni PIN kaydet
async function handleReset(req, res) {
  const body = readBody(req);
  const phone = cleanPhone(body.phone);
  const email = String(body.email || '').trim().toLowerCase();
  const code = String(body.code || '').replace(/\D/g, '');
  const pin = normalizePin(body.pin);
  const pinConfirm = normalizePin(body.pinConfirm);

  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'DATABASE_URL eksik' });
  if (phone.length < 10 || !email || code.length !== 6) {
    return res.status(400).json({ error: 'Bilgiler eksik' });
  }
  if (!isValidPinFormat(pin)) {
    return res.status(400).json({ error: 'Yeni PIN 4 veya 6 haneli olmalı.' });
  }
  if (pin !== pinConfirm) {
    return res.status(400).json({ error: 'PIN tekrarı eşleşmiyor.' });
  }

  const customer = await findCustomerByPhone(phone);
  if (!customer) return res.status(404).json({ error: 'Hesap bulunamadı' });
  if (String(customer.email || '').toLowerCase() !== email) {
    return res.status(400).json({ error: 'E-posta hesap ile eşleşmiyor' });
  }

  const sql = neon(process.env.DATABASE_URL);
  const verified = await verifyEmailCode(sql, { email, phone, code, purpose: 'pin_reset' });
  if (!verified.ok) return res.status(verified.status).json({ error: verified.error });

  await saveCustomerPin(sql, phone, customer.id, pin);

  return res.status(200).json({ ok: true });
}

// PIN sıfırlama — tek endpoint (Vercel Hobby function limiti)
export default async function handler(req, res) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = readBody(req);
    const action = String(body.action || 'send-code').trim();

    if (action === 'send-code') return handleSendCode(req, res);
    if (action === 'reset') return handleReset(req, res);

    return res.status(400).json({ error: 'Geçersiz işlem' });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'PIN sıfırlama başarısız' });
  }
}
