import { neon } from '@neondatabase/serverless';
import { applyCors, readBody } from '../lib/http.js';
import { cleanPhone } from '../lib/phone.js';
import { verifyEmailCode } from '../lib/emailCodes.js';

// Eski uç — yalnızca kod doğrulama (oturum açmaz)
export default async function handler(req, res) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = readBody(req);
    const phone = cleanPhone(body.phone);
    const email = String(body.email || '').trim().toLowerCase();
    const code = String(body.code || '').replace(/\D/g, '');
    const purpose = body.purpose === 'login' ? 'login' : 'register';

    if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'DATABASE_URL eksik' });
    if (!email || phone.length < 10 || code.length !== 6) {
      return res.status(400).json({ error: 'Bilgiler eksik' });
    }

    const sql = neon(process.env.DATABASE_URL);
    const verified = await verifyEmailCode(sql, { email, phone, code, purpose });
    if (!verified.ok) return res.status(verified.status).json({ error: verified.error });

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Kod doğrulanamadı' });
  }
}
