import admin from 'firebase-admin';

const EXPECTED_PROJECT_ID = 'liberte-club';

// Service account JSON'unu parse et
function parseServiceAccount(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    try {
      return JSON.parse(Buffer.from(text, 'base64').toString('utf8'));
    } catch {
      return null;
    }
  }
}

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
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { tokens = [], title = 'Liberte Club', body = 'Yeni kampanya var!' } = req.body || {};
  const clean = [...new Set(tokens.filter(Boolean))];
  if (!clean.length) {
    return res.status(200).json({ ok: true, sent: 0, note: 'Kayıtlı bildirim tokenı yok.' });
  }

  const serviceAccount = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if (!serviceAccount) {
    return res.status(200).json({
      ok: true,
      sent: 0,
      note: 'FIREBASE_SERVICE_ACCOUNT_JSON yok veya geçersiz. Firebase liberte-club service account JSON ekleyin.'
    });
  }

  if (serviceAccount.project_id && serviceAccount.project_id !== EXPECTED_PROJECT_ID) {
    return res.status(200).json({
      ok: false,
      sent: 0,
      note: `Service account yanlış proje (${serviceAccount.project_id}). liberte-club projesinden yeni key indirin.`
    });
  }

  try {
    const fb = getAdmin(serviceAccount);
    const result = await fb.messaging().sendEachForMulticast({
      tokens: clean,
      notification: { title, body },
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
      note: 'Push gönderimi başarısız. Service account ve FCM ayarlarını kontrol edin.'
    });
  }
}
