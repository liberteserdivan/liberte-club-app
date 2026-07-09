import { readFirebaseWebConfig } from './_lib/firebaseConfig.js';
import { isValidVapidPublicKey, normalizeVapidKey, readVapidKeyFromEnv } from './_lib/vapid.js';
import { getServiceAccountStatus, parseServiceAccount, validateServiceAccount } from './_lib/serviceAccount.js';
import { probeFcmCredentials } from './_lib/fcmProbe.js';
import { readSupabasePublicConfig } from './_lib/supabasePublicConfig.js';
import { createCustomerQrToken, formatQrPayload, resolveQrSigningSecret } from './_lib/qrToken.js';
import { requireConfigDiagAccess } from './_lib/configAccess.js';
import { isProductionRuntime } from './_lib/schemaReady.js';
import { resolvePublicSiteOrigin } from './_lib/siteOrigins.js';

function applyPublicCors(res, methods = 'GET,OPTIONS') {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Config-Diag');
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
    site: resolvePublicSiteOrigin()
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

  const body = {
    ok: sampleOk,
    signingReady: Boolean(signing.secret),
    sampleTokenCreated: sampleOk,
    samplePayloadLength,
    qrEndpoint: '/api/qr/generate'
  };

  // İmza kaynağı saldırganlara ipucu vermez — yalnızca geliştirmede göster
  if (!isProductionRuntime()) {
    body.signingSource = signing.source;
    if (signing.source === 'missing') {
      body.hint = 'QR_SIGNING_SECRET veya ADMIN_PIN ekleyin.';
    }
  }

  return res.status(200).json(body);
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

// Isınma — Vercel soğuk başlatmasını azaltır. Harici pinger (~5 dk) çağırır;
// varsayılan yalnızca lambda'yı uyandırır (DB/fan-out yok). ?db=1 ile tanılama ping'i.
// Tanılama için DB ping zaman sınırı — yalnızca ?db=1 ile istenir
const WARM_DB_PING_TIMEOUT_MS = 2500;

async function handleWarm(req, res, headOnly = false) {
  // STABİLİTE: Varsayılan ısınma YALNIZCA lambda'yı uyandırır — DB ping ve
  // fan-out YOK. Eski hâl her health çağrısında SELECT 1 + 4 paralel lambda
  // tetikliyordu; keep-warm (5dk) + uygulama açılışı birleşince pooler tükeniyordu.
  // Detaylı DB kontrolü: GET /api/health?db=1 (Guardian/tanılama)
  let dbOk = null;
  if (String(req.query?.db || '') === '1') {
    const { getSql } = await import('./_lib/sql.js');
    const sql = getSql();
    dbOk = false;
    if (sql) {
      try {
        const ping = sql`SELECT 1 AS ok`.then(() => true).catch(() => false);
        const timeout = new Promise((resolve) => { setTimeout(() => resolve(false), WARM_DB_PING_TIMEOUT_MS); });
        dbOk = await Promise.race([ping, timeout]);
      } catch {
        dbOk = false;
      }
    }
  }

  if (headOnly) return res.status(200).end();
  const body = { ok: true, ts: Date.now() };
  if (dbOk != null) body.dbOk = dbOk;
  return res.status(200).json(body);
}

// Supabase Realtime public config — yalnızca anon key, secret sızdırmaz
function handleSupabaseConfig(res) {
  const config = readSupabasePublicConfig();
  const payload = {
    url: config.url || null,
    anonKey: config.anonKey || null,
    projectRef: config.projectRef,
    enabled: config.enabled,
    hint: config.enabled
      ? null
      : 'SUPABASE_URL ve SUPABASE_ANON_KEY Vercel\'e ekleyin. Realtime opsiyonel kalır.'
  };

  // JWT secret yapılandırma durumu yalnızca tanılama ortamında
  if (!isProductionRuntime()) {
    payload.hasSupabaseJwtSecret = Boolean(String(process.env.SUPABASE_JWT_SECRET || '').trim());
  }

  return res.status(200).json(payload);
}

// RLS durumu — tanılama erişimi gerekir
async function handleRlsStatus(res) {
  const { getSql } = await import('./_lib/sql.js');
  const { readRlsStatus } = await import('./_lib/rlsOps.js');
  const sql = getSql();
  if (!sql) return res.status(503).json({ ok: false, error: 'Veritabanı yapılandırılmadı' });

  try {
    const status = await readRlsStatus(sql);
    return res.status(200).json(status);
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'RLS durumu okunamadı' });
  }
}

// RLS uygula — yalnızca CONFIG_DIAG_SECRET veya doğrulanmış admin
async function handleRlsApply(res) {
  const { getSql } = await import('./_lib/sql.js');
  const { applyAllRls } = await import('./_lib/rlsOps.js');
  const sql = getSql();
  if (!sql) return res.status(503).json({ ok: false, error: 'Veritabanı yapılandırılmadı' });

  try {
    const status = await applyAllRls(sql);
    return res.status(200).json({ ok: true, applied: true, ...status });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'RLS uygulanamadı' });
  }
}

// Runtime config — tek endpoint (Vercel Hobby: toplam 4 API function)
export default withSqlRequest(async function handler(req, res) {
  applyPublicCors(res, 'GET,HEAD,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const resource = String(req.query?.resource || '').trim().toLowerCase();

  if (req.method === 'POST' && resource === 'rls-apply') {
    const allowed = await requireConfigDiagAccess(req);
    if (!allowed) return res.status(403).json({ error: 'Tanılama erişimi reddedildi' });
    return handleRlsApply(res);
  }

  // HEAD — UptimeRobot vb. izleyiciler ısınma için HEAD kullanır; gövdesiz 200 dön
  if (req.method === 'HEAD') return handleWarm(req, res, true);

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (resource === 'warm') return handleWarm(req, res);
  if (resource === 'firebase') return handleFirebase(res);
  if (resource === 'push') return handlePush(res);

  // Altyapı tanılama — production'da yönetici veya CONFIG_DIAG_SECRET gerekir
  if (resource === 'push-status' || resource === 'db-status' || resource === 'qr-status' || resource === 'rls-status') {
    const allowed = await requireConfigDiagAccess(req);
    if (!allowed) {
      return res.status(403).json({ error: 'Tanılama erişimi reddedildi' });
    }
    if (resource === 'push-status') return handlePushStatus(res);
    if (resource === 'db-status') return handleDbStatus(res);
    if (resource === 'rls-status') return handleRlsStatus(res);
    return handleQrStatus(res);
  }

  if (resource === 'supabase') return handleSupabaseConfig(res);

  return res.status(400).json({ error: 'resource parametresi gerekli: warm, firebase, push, push-status, db-status, qr-status, rls-status veya supabase' });
});
