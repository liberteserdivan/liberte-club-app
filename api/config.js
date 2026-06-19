import { readFirebaseWebConfig } from './_lib/firebaseConfig.js';
import { isValidVapidPublicKey, normalizeVapidKey, readVapidKeyFromEnv } from './_lib/vapid.js';
import { getServiceAccountStatus, parseServiceAccount, validateServiceAccount } from './_lib/serviceAccount.js';
import { probeFcmCredentials } from './_lib/fcmProbe.js';
import { resolveQrSigningSecret, createCustomerQrToken, formatQrPayload } from './_lib/qrToken.js';

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
async function handlePushStatus(res) {
  const vapidKey = readVapidKeyFromEnv();
  const serviceAccount = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const adminStatus = getServiceAccountStatus(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const structureError = validateServiceAccount(serviceAccount);
  const fcmProbe = serviceAccount && !structureError
    ? await probeFcmCredentials(serviceAccount)
    : { ok: false, code: 'invalid_account', message: structureError || adminStatus.state };

  const adminReady = adminStatus.state === 'hazir' && fcmProbe.ok;

  return res.status(200).json({
    projectId: 'liberte-club',
    vapidReady: Boolean(vapidKey),
    vapidLength: vapidKey.length,
    adminReady,
    adminProjectId: adminStatus.projectId,
    adminState: adminStatus.state,
    adminHint: structureError
      || (adminStatus.state === 'gecersiz'
        ? 'JSON bozuk. Firebase liberte-club key indirip tek satır yapıştırın.'
        : adminStatus.state === 'yanlis_proje'
          ? 'Yanlış Firebase projesi. liberte-club kullanın.'
          : adminStatus.state === 'yok'
            ? 'FIREBASE_SERVICE_ACCOUNT_JSON Vercel\'e ekleyin.'
            : ''),
    fcmAuthOk: fcmProbe.ok,
    fcmAuthCode: fcmProbe.code,
    fcmAuthHint: fcmProbe.ok
      ? ''
      : (fcmProbe.message || 'Firebase service account Google OAuth doğrulaması başarısız.'),
    memberPushReady: Boolean(vapidKey),
    adminSendReady: adminReady,
    iosWebPushHint: 'iPhone için: Firebase Console → Cloud Messaging → Apple → APNs Authentication Key (.p8) yükleyin.',
    androidHint: 'Android için: Google Cloud Console → Firebase Cloud Messaging API etkin olmalı.',
    webHint: 'Web token varsa: Firebase Console → Cloud Messaging → Web Push sertifikası VAPID ile aynı olmalı.',
    site: 'https://app.liberte.cafe'
  });
}

// QR imza yapılandırması — secret sızdırmaz
function handleQrStatus(res) {
  const signing = resolveQrSigningSecret();
  let sampleOk = false;
  let samplePayloadLength = 0;

  if (signing.secret) {
    try {
      const issued = createCustomerQrToken(1);
      const payload = formatQrPayload(issued.token);
      sampleOk = Boolean(issued.token && payload);
      samplePayloadLength = payload.length;
    } catch {
      sampleOk = false;
    }
  }

  return res.status(200).json({
    ok: sampleOk,
    signingSource: signing.source,
    signingReady: Boolean(signing.secret),
    sampleTokenCreated: sampleOk,
    samplePayloadLength,
    qrEndpoint: '/api/qr/generate',
    hint: signing.source === 'missing'
      ? 'Vercel production: QR_SIGNING_SECRET veya ADMIN_PIN ekleyin.'
      : null
  });
}

// Veritabanı bağlantı özeti — secret sızdırmaz, cutover doğrulama
async function handleDbStatus(res) {
  const { describeDatabaseUrl } = await import('./_lib/dbConnection.js');
  const { getSql } = await import('./_lib/sql.js');
  const info = describeDatabaseUrl(process.env.DATABASE_URL);
  let pingOk = false;
  let tableCount = 0;

  const sql = getSql();
  if (sql) {
    try {
      await sql`SELECT 1 AS ok`;
      pingOk = true;
      const rows = await sql`
        SELECT count(*)::int AS c
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      `;
      tableCount = Number(rows[0]?.c || 0);
    } catch {
      pingOk = false;
    }
  }

  return res.status(200).json({
    ok: pingOk && info.provider !== 'neon',
    ...info,
    pingOk,
    publicTableCount: tableCount,
    useRelationalState: info.relationalState,
    neonBlocked: info.provider === 'neon' && (info.env === 'production' || process.env.VERCEL_ENV === 'production'),
    recommendation: info.provider === 'neon'
      ? 'KRİTİK: Production hâlâ Neon — Vercel DATABASE_URL Supabase pooler :6543 olmalı.'
      : info.provider === 'supabase' && !info.transactionPooler
        ? 'Supabase transaction pooler (:6543) önerilir.'
        : null
  });
}

// Runtime config — tek endpoint (Vercel Hobby: toplam 4 API function)
export default async function handler(req, res) {
  applyPublicCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const resource = String(req.query?.resource || '').trim().toLowerCase();

  if (resource === 'firebase') return handleFirebase(res);
  if (resource === 'push') return handlePush(res);
  if (resource === 'push-status') return handlePushStatus(res);
  if (resource === 'db-status') return handleDbStatus(res);
  if (resource === 'qr-status') return handleQrStatus(res);

  return res.status(400).json({ error: 'resource parametresi gerekli: firebase, push, push-status, db-status veya qr-status' });
}
