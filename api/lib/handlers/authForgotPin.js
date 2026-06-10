import { neon } from '@neondatabase/serverless';
import { applyCors, readBody } from '../http.js';
import { verifyEmailCode } from '../emailCodes.js';
import { sendVerificationCode } from '../verificationMail.js';
import { upsertCustomerEmail } from '../customerEmails.js';
import { getSql } from '../appState.js';
import { resolveRecoveryCustomer } from '../customerRepair.js';
import {
  isValidPinFormat,
  normalizePin,
  saveCustomerPin
} from '../pinAuth.js';

// İstek gövdesinden tanımlayıcıyı oku (e-posta veya telefon)
function readIdentifier(body) {
  return String(body.identifier || body.email || body.phone || '').trim();
}

// PIN unutma — kayıtlı e-postaya doğrulama kodu gönder
async function handleSendCode(req, res) {
  const body = readBody(req);
  const identifier = readIdentifier(body);
  const resolved = await resolveRecoveryCustomer(identifier);

  if (!resolved.ok) {
    return res.status(resolved.status || 400).json({ error: resolved.error });
  }

  const { customer, deliveryEmail, phone } = resolved;

  const sent = await sendVerificationCode({
    email: deliveryEmail,
    phone,
    purpose: 'pin_reset',
    subject: 'Liberte PIN sıfırlama kodun',
    greeting: `Merhaba ${customer.name || 'Liberte Üye'},`
  });

  if (!sent.ok) return res.status(sent.status || 500).json({ error: sent.error });

  return res.status(200).json({
    ok: true,
    emailMasked: sent.emailMasked,
    testCode: sent.testCode,
    warning: sent.warning
  });
}

// PIN unutma — kodları doğrula ve yeni PIN kaydet
async function handleReset(req, res) {
  const body = readBody(req);
  const identifier = readIdentifier(body);
  const code = String(body.code || '').replace(/\D/g, '');
  const pin = normalizePin(body.pin);
  const pinConfirm = normalizePin(body.pinConfirm);

  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'DATABASE_URL eksik' });
  if (!identifier || code.length !== 6) {
    return res.status(400).json({ error: 'Bilgiler eksik' });
  }
  if (!isValidPinFormat(pin)) {
    return res.status(400).json({ error: 'Yeni PIN 4 veya 6 haneli olmalı.' });
  }
  if (pin !== pinConfirm) {
    return res.status(400).json({ error: 'PIN tekrarı eşleşmiyor.' });
  }

  const resolved = await resolveRecoveryCustomer(identifier);
  if (!resolved.ok) {
    return res.status(resolved.status || 404).json({ error: resolved.error });
  }

  const { customer, deliveryEmail, phone } = resolved;
  const sql = neon(process.env.DATABASE_URL);
  const verified = await verifyEmailCode(sql, {
    email: deliveryEmail,
    phone,
    code,
    purpose: 'pin_reset'
  });
  if (!verified.ok) return res.status(verified.status).json({ error: verified.error });

  await saveCustomerPin(sql, phone, customer.id, pin);

  const indexSql = getSql();
  if (indexSql) {
    await upsertCustomerEmail(indexSql, {
      email: deliveryEmail,
      customerId: customer.id,
      phone
    });
  }

  return res.status(200).json({ ok: true });
}

// PIN sıfırlama
export async function handleAuthForgotPin(req, res) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = readBody(req);
    const action = String(body.action || 'send-code').trim();

    if (action === 'send-code') return await handleSendCode(req, res);
    if (action === 'reset') return await handleReset(req, res);

    return res.status(400).json({ error: 'Geçersiz işlem' });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'PIN sıfırlama başarısız' });
  }
}
