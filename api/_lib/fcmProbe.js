import { JWT } from 'google-auth-library';

const FCM_PROBE_TTL_MS = 5 * 60 * 1000;
let cachedProbe = { email: '', at: 0, result: null };

// Teşhis mesajından hassas detayları kısalt
function sanitizeProbeMessage(message = '') {
  return String(message || 'bilinmeyen hata').replace(/\s+/g, ' ').trim().slice(0, 160);
}

// Kısa süreli OAuth önbelleği — her push gönderiminde Google'a gitme
function readCachedProbe(serviceAccount) {
  const email = String(serviceAccount?.client_email || '');
  if (!email || !cachedProbe.result) return null;
  if (cachedProbe.email !== email) return null;
  if (Date.now() - cachedProbe.at > FCM_PROBE_TTL_MS) return null;
  return cachedProbe.result;
}

function writeCachedProbe(serviceAccount, result) {
  cachedProbe = {
    email: String(serviceAccount?.client_email || ''),
    at: Date.now(),
    result
  };
}

// private_key PEM formatında mı
export function isValidPrivateKeyPem(privateKey = '') {
  const text = String(privateKey || '');
  return text.includes('BEGIN PRIVATE KEY') && text.includes('END PRIVATE KEY') && text.length >= 500;
}

// Service account ile FCM OAuth erişimini dene
export async function probeFcmCredentials(serviceAccount, { force = false } = {}) {
  if (!serviceAccount?.client_email || !serviceAccount?.private_key) {
    return {
      ok: false,
      code: 'missing_fields',
      message: 'Service account alanları eksik'
    };
  }

  if (!isValidPrivateKeyPem(serviceAccount.private_key)) {
    return {
      ok: false,
      code: 'bad_private_key',
      message: 'private_key bozuk veya kesilmiş. Firebase key yeniden indirip Vercel\'e tek satır yapıştırın.'
    };
  }

  if (!force) {
    const cached = readCachedProbe(serviceAccount);
    if (cached) return cached;
  }

  try {
    const client = new JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: ['https://www.googleapis.com/auth/firebase.messaging']
    });
    const tokenResponse = await client.getAccessToken();
    if (!tokenResponse?.token) {
      return {
        ok: false,
        code: 'no_token',
        message: 'Google access token alınamadı'
      };
    }

    const result = { ok: true, code: 'ok', message: '' };
    writeCachedProbe(serviceAccount, result);
    return result;
  } catch (error) {
    const result = {
      ok: false,
      code: 'oauth_failed',
      message: sanitizeProbeMessage(error?.message)
    };
    writeCachedProbe(serviceAccount, result);
    return result;
  }
}
