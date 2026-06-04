import { readVapidKeyFromEnv } from '../lib/vapid.js';
import { parseServiceAccount } from '../lib/serviceAccount.js';

// Push kurulum durumunu kontrol et — gizli anahtar döndürmez
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const vapidKey = readVapidKeyFromEnv();
  const serviceAccount = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const adminProjectId = serviceAccount?.project_id || (process.env.FIREBASE_SERVICE_ACCOUNT_JSON ? 'geçersiz' : 'yok');
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
