import { neon } from '@neondatabase/serverless';
import { applyCors, readBody } from '../lib/http.js';
import { cleanPhone } from '../lib/phone.js';
import { createSession, findCustomerByPhone } from '../lib/auth.js';
import { verifyEmailCode } from '../lib/emailCodes.js';

// Giriş OTP doğrulama ve oturum açma
export default async function handler(req, res) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = readBody(req);
    const phone = cleanPhone(body.phone);
    const email = String(body.email || '').trim().toLowerCase();
    const code = String(body.code || '').replace(/\D/g, '');
    const deviceId = String(body.deviceId || '').trim();

    if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'DATABASE_URL eksik' });
    if (phone.length < 10 || !email || code.length !== 6) {
      return res.status(400).json({ error: 'Bilgiler eksik' });
    }

    const customer = await findCustomerByPhone(phone);
    if (!customer) return res.status(404).json({ error: 'Müşteri bulunamadı' });
    if (String(customer.email || '').toLowerCase() !== email) {
      return res.status(400).json({ error: 'E-posta hesap ile eşleşmiyor' });
    }

    const sql = neon(process.env.DATABASE_URL);
    const verified = await verifyEmailCode(sql, { email, phone, code, purpose: 'login' });
    if (!verified.ok) return res.status(verified.status).json({ error: verified.error });

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
      sessionToken: session.token
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Giriş tamamlanamadı' });
  }
}
