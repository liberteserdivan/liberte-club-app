import { neon } from '@neondatabase/serverless';
import { applyCors, readBody } from '../lib/http.js';
import { cleanPhone } from '../lib/phone.js';
import { findCustomerByPhone } from '../lib/auth.js';
import { verifyEmailCode } from '../lib/emailCodes.js';
import {
  isValidPinFormat,
  normalizePin,
  saveCustomerPin
} from '../../lib/pinAuth.js';

// PIN unutma — kod doğrula ve yeni PIN kaydet
export default async function handler(req, res) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
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
  } catch (e) {
    return res.status(500).json({ error: e.message || 'PIN sıfırlanamadı' });
  }
}
