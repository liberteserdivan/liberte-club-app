import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const TOKEN_VERSION = 1;
const TOKEN_TTL_MS = 90 * 1000;
const QR_PREFIX = 'liberte-qr:';

// İmza anahtarı — üretimde yalnızca QR_SIGNING_SECRET
export function resolveQrSigningSecret() {
  const qrSecret = String(process.env.QR_SIGNING_SECRET || '').trim();
  if (qrSecret) return { secret: qrSecret, source: 'QR_SIGNING_SECRET' };

  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
  if (isProduction) {
    return { secret: null, source: 'missing' };
  }

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
  const { secret } = resolveQrSigningSecret();
  if (!secret) {
    throw new Error('QR_SIGNING_SECRET yapılandırılmadı');
  }
  return secret;
}

function encodeBase64Url(value) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decodeBase64Url(value) {
  return Buffer.from(String(value || ''), 'base64url').toString('utf8');
}

// Müşteri QR tokeni üret
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
    ttlSeconds: Math.floor(TOKEN_TTL_MS / 1000),
    payload
  };
}

// QR render metni
export function formatQrPayload(token) {
  return `${QR_PREFIX}${token}`;
}

// Ham okumadan token ayıkla
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
  const match = text.match(/v\d+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  if (match) return match[0];
  return text;
}

// QR token doğrula
export function verifyCustomerQrToken(token, { allowExpired = false } = {}) {
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
    const expired = Date.now() > Number(payload.exp);
    if (expired && !allowExpired) {
      return { ok: false, error: 'QR süresi doldu. Müşteri ekranı yenilesin.', expired: true };
    }
    return {
      ok: true,
      customerId: Number(payload.customerId),
      nonce: String(payload.nonce || ''),
      expiresAt: Number(payload.exp),
      expired
    };
  } catch {
    return { ok: false, error: 'QR okunamadı' };
  }
}
