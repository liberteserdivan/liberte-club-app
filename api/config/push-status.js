import { readVapidKeyFromEnv } from '../lib/vapid.js';

// Service account proje kimliğini oku
function readAdminProjectId() {
  try {
    const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
    if (!raw) return '';
    const parsed = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
    return String(parsed.project_id || '').trim();
  } catch {
    return 'geçersiz';
  }
}

// Push kurulum durumunu kontrol et — gizli anahtar döndürmez
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const vapidKey = readVapidKeyFromEnv();
  const adminProjectId = readAdminProjectId();
  const adminReady = adminProjectId === 'liberte-club';

  return res.status(200).json({
    projectId: 'liberte-club',
    vapidReady: Boolean(vapidKey),
    vapidLength: vapidKey.length,
    adminReady,
    adminProjectId: adminProjectId || 'yok',
    memberPushReady: Boolean(vapidKey),
    adminSendReady: adminReady,
    site: 'https://app.liberte.cafe'
  });
}
