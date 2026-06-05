import { neon } from '@neondatabase/serverless';
import { applyCors, readBody } from '../lib/http.js';
import { cleanPhone } from '../lib/phone.js';
import {
  createSession,
  findCustomerByPhone,
  getSession,
  readAuthToken
} from '../lib/auth.js';
import { isValidPinFormat, normalizePin, verifyCustomerPin } from '../lib/pinAuth.js';

// Giriş — telefon + PIN; geçerli oturum varsa PIN isteme
export default async function handler(req, res) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = readBody(req);
    const phone = cleanPhone(body.phone);
    const pin = normalizePin(body.pin);
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
        customerId: customer.id,
        role: existing.role,
        isAdmin: existing.isAdmin,
        adminVerified: existing.adminVerified
      });
    }

    if (!isValidPinFormat(pin)) {
      return res.status(400).json({ error: 'PIN 4 veya 6 haneli olmalı.' });
    }

    const sql = neon(process.env.DATABASE_URL);
    const verified = await verifyCustomerPin(sql, phone, pin);
    if (!verified.ok) {
      return res.status(verified.status).json({
        error: verified.error,
        lockedUntil: verified.lockedUntil || null
      });
    }

    const role = customer.isAdmin ? 'admin' : 'user';
    const session = await createSession(res, {
      customerId: customer.id,
      role,
      deviceId
    });

    return res.status(200).json({
      ok: true,
      customerId: customer.id,
      role: session.role,
      isAdmin: session.isAdmin,
      adminVerified: false,
      sessionToken: session.token
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Giriş yapılamadı' });
  }
}
