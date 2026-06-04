import { readVapidKeyFromEnv } from '../lib/vapid.js';

// Push kurulum durumunu kontrol et — gizli anahtar döndürmez
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const vapidKey = readVapidKeyFromEnv();
  const hasAdmin = Boolean(String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim());

  return res.status(200).json({
    projectId: 'liberte-club',
    vapidReady: Boolean(vapidKey),
    vapidLength: vapidKey.length,
    adminReady: hasAdmin,
    memberPushReady: Boolean(vapidKey),
    adminSendReady: hasAdmin,
    site: 'https://app.liberte.cafe'
  });
}
