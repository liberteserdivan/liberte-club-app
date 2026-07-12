import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const TOKEN_VERSION = 1;
const TOKEN_TTL_MS = 90 * 1000;
const QR_PREFIX = 'liberte-qr:';

// İmza anahtarı — üretimde YALNIZCA QR_SIGNING_SECRET kabul edilir.
export function resolveQrSigningSecret() {
  const qrSecret = String(process.env.QR_SIGNING_SECRET || '').trim();
  if (qrSecret) return { secret: qrSecret, source: 'QR_SIGNING_SECRET' };

  // RB-2: Üretimde düşük entropili ADMIN_PIN türetmesi KULLANILMAZ. Aksi halde
  // tek geçerli token ile ADMIN_PIN offline brute-force edilip token forge
  // edilebilirdi. Üretimde anahtar yoksa "missing" döner (QR üretimi 503 olur).
  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
  if (isProduction) {
    return { secret: null, source: 'missing' };
  }

  // Yalnızca üretim DIŞI ortamlarda geliştirme kolaylığı için türetme/fallback.
  const adminPin = String(process.env.ADMIN_PIN || '').trim();
  if (adminPin) {
    return {
      secret: createHash('sha256').update(`liberte-qr-v1:${adminPin}`).digest('hex'),
      source: 'ADMIN_PIN_DERIVED'
    };
  }

  return { secret: 'dev-qr-signing-secret', source: 'dev_fallback' };
}

function signingSecret() {
  const { secret, source } = resolveQrSigningSecret();
  if (!secret) {
    throw new Error('QR_SIGNING_SECRET veya ADMIN_PIN yapılandırılmadı');
  }
  return secret;
}

// Base64url kodla
function encodeBase64Url(value) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

// Base64url çöz
function decodeBase64Url(value) {
  return Buffer.from(String(value || ''), 'base64url').toString('utf8');
}

// Müşteri QR tokeni üret — kısa ömürlü HMAC
export function createCustomerQrToken(customerId) {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = {
    v: TOKEN_VERSION,
    customerId: Number(customerId),
    exp,
    nonce: randomBytes(8).toString('hex')
  };

  const body = encodeBase64Url(JSON.stringify(payload));
  const sig = createHmac('sha256', signingSecret()).update(body).digest('base64url');
  return {
    token: `v${TOKEN_VERSION}.${body}.${sig}`,
    expiresAt: exp,
    ttlSeconds: Math.floor(TOKEN_TTL_MS / 1000)
  };
}

// QR render için tam metin — frontend ile uyumlu
export function formatQrPayload(token) {
  return `${QR_PREFIX}${token}`;
}

// Ham okumadan imza gövdesini ayıkla (prefix / BOM / gömülü metin)
export function normalizeQrTokenInput(raw) {
  let text = String(raw || '')
    .replace(/^\uFEFF/, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();

  if (!text) return '';

  const lower = text.toLowerCase();
  const prefixAt = lower.indexOf(QR_PREFIX);
  if (prefixAt >= 0) {
    text = text.slice(prefixAt + QR_PREFIX.length).trim();
  }

  // URL veya ek metin içinde v1.body.sig yakala
  const match = text.match(/v\d+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  if (match) return match[0];

  return text;
}

// QR token doğrula
export function verifyCustomerQrToken(token) {
  try {
    const normalized = normalizeQrTokenInput(token);
    const parts = String(normalized || '').split('.');
    if (parts.length !== 3) {
      return { ok: false, error: 'Geçersiz QR kodu' };
    }

    const [versionTag, body, sig] = parts;
    if (versionTag !== `v${TOKEN_VERSION}`) {
      return { ok: false, error: 'QR sürümü desteklenmiyor' };
    }

    const expected = createHmac('sha256', signingSecret()).update(body).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, error: 'QR imzası geçersiz' };
    }

    const payload = JSON.parse(decodeBase64Url(body));
    if (!payload?.customerId || !payload?.exp) {
      return { ok: false, error: 'QR içeriği geçersiz' };
    }

    if (Date.now() > Number(payload.exp)) {
      return { ok: false, error: 'QR süresi doldu. Müşteri ekranı yenilesin.' };
    }

    return {
      ok: true,
      customerId: Number(payload.customerId),
      nonce: String(payload.nonce || ''),
      expiresAt: Number(payload.exp)
    };
  } catch {
    return { ok: false, error: 'QR okunamadı' };
  }
}
