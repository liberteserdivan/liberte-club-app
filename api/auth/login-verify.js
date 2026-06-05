import { applyCors } from '../lib/http.js';

// Eski e-posta OTP girişi — artık kullanılmıyor
export default async function handler(req, res) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  return res.status(410).json({ error: 'E-posta OTP girişi kaldırıldı. Telefon + PIN kullanın.' });
}
