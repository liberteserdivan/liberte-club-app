import { readFirebaseWebConfig } from './lib/firebaseConfig.js';
import { isValidVapidPublicKey, normalizeVapidKey, readVapidKeyFromEnv } from './lib/vapid.js';
import { getServiceAccountStatus } from './lib/serviceAccount.js';

function applyPublicCors(res, methods = 'GET,OPTIONS') {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// Firebase web config
function handleFirebase(res) {
  return res.status(200).json(readFirebaseWebConfig());
}

// Push VAPID anahtarı
function handlePush(res) {
  const vapidKey = readVapidKeyFromEnv();
  if (vapidKey) {
    return res.status(200).json({ vapidKey });
  }

  const raw = normalizeVapidKey(
    process.env.FIREBASE_VAPID_PUBLIC_KEY
    || process.env.VITE_FIREBASE_VAPID_KEY
    || ''
  );

  if (!raw) {
    return res.status(503).json({ error: 'VAPID yapılandırılmadı' });
  }

  return res.status(503).json({
    error: 'VAPID geçersiz veya eksik',
    hint: 'Firebase Cloud Messaging → Web Push → Key pair public key tam kopyalanmalı (~88 karakter).',
    length: raw.length,
    valid: isValidVapidPublicKey(raw)
  });
}

// Push kurulum durumu — gizli anahtar döndürmez
function handlePushStatus(res) {
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

// Runtime config — tek endpoint (Vercel Hobby function limiti)
export default async function handler(req, res) {
  applyPublicCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const resource = String(req.query?.resource || '').trim().toLowerCase();

  if (resource === 'firebase') return handleFirebase(res);
  if (resource === 'push') return handlePush(res);
  if (resource === 'push-status') return handlePushStatus(res);

  return res.status(400).json({ error: 'resource parametresi gerekli: firebase, push veya push-status' });
}
