import { readVapidKeyFromEnv } from '../lib/vapid.js';
import { getServiceAccountStatus } from '../lib/serviceAccount.js';

// Push kurulum durumunu kontrol et — gizli anahtar döndürmez
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const vapidKey = readVapidKeyFromEnv();
  const adminStatus = getServiceAccountStatus(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const adminReady = adminStatus.state === 'hazir';

  return res.status(200).json({
    projectId: 'liberte-club',
    vapidReady: Boolean(vapidKey),
    vapidLength: vapidKey.length,
    adminReady,
    adminProjectId: adminStatus.projectId,
    adminState: adminStatus.state,
    adminHint: adminStatus.state === 'gecersiz'
      ? 'JSON bozuk. Firebase liberte-club key indirip tek satır yapıştırın.'
      : adminStatus.state === 'yanlis_proje'
        ? 'Yanlış Firebase projesi. liberte-club kullanın.'
        : adminStatus.state === 'yok'
          ? 'FIREBASE_SERVICE_ACCOUNT_JSON Vercel\'e ekleyin.'
          : '',
    memberPushReady: Boolean(vapidKey),
    adminSendReady: adminReady,
    iosWebPushHint: 'iPhone için: PWA ana ekrandan açılmalı. Firebase Console → Cloud Messaging → Apple yapılandırmasında APNs Auth Key gerekli.',
    site: 'https://app.liberte.cafe'
  });
}
