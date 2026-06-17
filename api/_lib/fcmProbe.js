import { JWT } from 'google-auth-library';

// Teşhis mesajından hassas detayları kısalt
function sanitizeProbeMessage(message = '') {
  return String(message || 'bilinmeyen hata').replace(/\s+/g, ' ').trim().slice(0, 160);
}

// private_key PEM formatında mı
export function isValidPrivateKeyPem(privateKey = '') {
  const text = String(privateKey || '');
  return text.includes('BEGIN PRIVATE KEY') && text.includes('END PRIVATE KEY') && text.length >= 500;
}

// Service account ile FCM OAuth erişimini dene
export async function probeFcmCredentials(serviceAccount) {
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

    return { ok: true, code: 'ok', message: '' };
  } catch (error) {
    return {
      ok: false,
      code: 'oauth_failed',
      message: sanitizeProbeMessage(error?.message)
    };
  }
}
