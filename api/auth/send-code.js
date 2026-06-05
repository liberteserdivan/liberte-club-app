import { applyCors, readBody } from '../lib/http.js';

// Eski kayıt OTP endpoint — artık kullanılmıyor
export default async function handler(req, res) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  return res.status(410).json({
    error: 'E-posta OTP kayıt kaldırıldı. Kayıt için telefon + PIN kullanın. PIN sıfırlama: /api/auth/forgot-pin/send-code'
  });
}
