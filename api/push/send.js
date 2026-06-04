import admin from 'firebase-admin';
import { parseServiceAccount, validateServiceAccount } from '../lib/serviceAccount.js';

const SITE_ORIGIN = 'https://app.liberte.cafe';

// Firebase Admin SDK başlat
function getAdmin(serviceAccount) {
  if (admin.apps.length) return admin;
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  return admin;
}

// FCM hata kodlarını özetle
function summarizeFailures(responses) {
  return responses
    .filter((row) => !row.success)
    .map((row) => row.error?.code || row.error?.message)
    .filter(Boolean)
    .slice(0, 3)
    .join(', ');
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
    // Web push — yalnızca data; SW bildirimi gösterir (fcmOptions.link Chrome'da URL uyarısı çıkarır)
    const result = await fb.messaging().sendEachForMulticast({
      tokens: clean,
      data: {
        title: String(title),
        body: String(message),
        url: SITE_ORIGIN
      },
      webpush: {
        headers: {
          Urgency: 'high',
          TTL: '86400'
        },
        data: {
          title: String(title),
          body: String(message),
          url: SITE_ORIGIN
        }
      }
    });

    const failures = summarizeFailures(result.responses);
    let note = `${result.successCount} cihaza iletildi`;
    if (result.failureCount) note += `, ${result.failureCount} başarısız`;
    if (failures) note += ` (${failures})`;
    if (result.successCount > 0) {
      note += '. Görünmüyorsa uygulamayı arka plana alın veya Bildirimleri yeniden açın.';
    }

    return res.status(200).json({
      ok: result.successCount > 0,
      sent: result.successCount,
      failed: result.failureCount,
      note
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
