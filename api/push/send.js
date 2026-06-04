import admin from 'firebase-admin';
import { parseServiceAccount, validateServiceAccount } from '../lib/serviceAccount.js';

// Firebase Admin SDK başlat
function getAdmin(serviceAccount) {
  if (admin.apps.length) return admin;
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  return admin;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  try {
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { tokens = [], title = 'Liberte Club', body: message = 'Yeni kampanya var!' } = body;
    const clean = [...new Set(tokens.filter(Boolean))];

    if (!clean.length) {
      return res.status(200).json({ ok: true, sent: 0, note: 'Kayıtlı bildirim tokenı yok.' });
    }

    const serviceAccount = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    const validationError = validateServiceAccount(serviceAccount);
    if (validationError) {
      return res.status(200).json({ ok: false, sent: 0, note: validationError });
    }

    const fb = getAdmin(serviceAccount);
    const result = await fb.messaging().sendEachForMulticast({
      tokens: clean,
      notification: { title, body: message },
      webpush: {
        notification: { icon: '/liberte-logo.png', badge: '/liberte-logo.png' },
        fcmOptions: { link: 'https://app.liberte.cafe' }
      }
    });

    return res.status(200).json({
      ok: true,
      sent: result.successCount,
      failed: result.failureCount,
      note: `${result.successCount} cihaza iletildi${result.failureCount ? `, ${result.failureCount} başarısız` : ''}.`
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      sent: 0,
      error: error?.message || 'Push gönderilemedi',
      note: `Push hatası: ${error?.message || 'bilinmeyen hata'}`
    });
  }
}
