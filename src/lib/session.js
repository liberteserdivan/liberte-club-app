import {
  apiJson,
  AUTH_REQUEST_OPTIONS,
  clearNativeAuthToken,
  getStoredAuthToken,
  hasStoredAuthToken,
  saveNativeAuthToken
} from './apiClient.js';
import { isLocalAuth } from './devAuth.js';
import { clearAdminSnapshot } from './adminFullSnapshot.js';
import { clearLocalDb } from './db.js';
import { resetRemoteFetchState } from './remoteFetch.js';
import { clearSafeModeState } from './safeMode.js';
import { bumpAuthEpoch as bumpAuthEpochCounter, getAuthEpoch } from './authEpoch.js';

export { getAuthEpoch } from './authEpoch.js';

// Bellekte tutulan oturum — localStorage kullanılmaz
let memorySession = null;

// Oturum değişiminde nesli ilerlet — eski uçuştaki yanıtları geçersiz kıl
function bumpAuthEpoch() {
  bumpAuthEpochCounter();
}

export function getRealtimeToken() {
  return memorySession?.realtimeToken || null;
}

export function getMemorySession() {
  return memorySession;
}

export function setMemorySession(session) {
  memorySession = session;
  // Oturum kimliği değişti — eski uçuştaki yanıtlar geçersiz olsun
  bumpAuthEpoch();
}

// Oturum alanlarını kısmi güncelle
export function patchMemorySession(patch) {
  if (!memorySession) return null;
  memorySession = { ...memorySession, ...patch };
  return memorySession;
}

const ADMIN_PIN_FLAG_KEY = 'liberteAdminPinVerified';

// Bu oturumda admin PIN doğrulandı mı — sunucu gecikmesinde ezilmesin
export function markAdminPinVerifiedLocally() {
  try {
    sessionStorage.setItem(ADMIN_PIN_FLAG_KEY, String(Date.now()));
  } catch {
    // yoksay
  }
}

export function clearAdminPinVerifiedLocally() {
  try {
    sessionStorage.removeItem(ADMIN_PIN_FLAG_KEY);
  } catch {
    // yoksay
  }
}

export function hasAdminPinVerifiedLocally() {
  try {
    return Boolean(sessionStorage.getItem(ADMIN_PIN_FLAG_KEY));
  } catch {
    return false;
  }
}

// Sunucudan oturumu doğrula (açılış bootstrap)
export async function bootstrapSession() {
  if (isLocalAuth()) {
    return memorySession ? { session: memorySession } : null;
  }

  const epochAtStart = getAuthEpoch();

  // Bootstrap bitmeden login/logout olduysa bellek oturumunu ezme
  function authChangedDuringBootstrap() {
    return getAuthEpoch() !== epochAtStart;
  }

  try {
    const { response, data } = await apiJson('/api/auth/session', {
      ...AUTH_REQUEST_OPTIONS,
      skipUnauthorized: true
    });

    if (authChangedDuringBootstrap()) {
      return memorySession ? { session: memorySession } : null;
    }

    // 401 — oturum yok/geçersiz; giriş ekranı için normal, modal yok
    if (response.status === 401) {
      memorySession = null;
      return null;
    }

    // 503 — geçici DB; giriş formu kullanılabilir kalsın
    if (response.status === 503) {
      memorySession = null;
      return {
        sessionUnavailable: true,
        code: data?.code || 'SESSION_TEMPORARILY_UNAVAILABLE',
        message: data?.error || data?.clientMessage || 'Oturum şu an doğrulanamıyor. Giriş yapmayı deneyebilirsiniz.'
      };
    }

    if (!response.ok || !data?.ok) {
      memorySession = null;
      return null;
    }

    memorySession = {
      customerId: data.customerId,
      role: data.role,
      isAdmin: Boolean(data.isAdmin),
      adminVerified: Boolean(data.adminVerified),
      realtimeToken: data.realtimeToken || null
    };
    // Bootstrap restore epoch artırmaz — yalnızca login/logout geçersiz kılır

    if (data.sessionToken) {
      saveNativeAuthToken(data.sessionToken);
    }

    return {
      session: memorySession,
      customer: data.customer || null,
      loyalty: data.loyalty || null
    };
  } catch {
    if (authChangedDuringBootstrap()) {
      return memorySession ? { session: memorySession } : null;
    }
    memorySession = null;
    return null;
  }
}

// Cookie oturumu varsa Bearer tokenı storage'a yaz — QR/native için
export async function hydrateSessionTokenFromServer() {
  if (isLocalAuth() || hasStoredAuthToken()) {
    return hasStoredAuthToken();
  }

  try {
    const { response, data } = await apiJson('/api/auth/session', {
      ...AUTH_REQUEST_OPTIONS,
      skipUnauthorized: true
    });

    if (response.ok && data?.ok && data.sessionToken) {
      saveNativeAuthToken(data.sessionToken);
    }
  } catch {
    // Sessizce geç
  }

  return hasStoredAuthToken();
}

// Oturum aç
export function applyAuthResult(result) {
  memorySession = {
    customerId: result.customerId,
    role: result.role || 'user',
    isAdmin: Boolean(result.isAdmin),
    adminVerified: Boolean(result.adminVerified),
    realtimeToken: result.realtimeToken || null
  };
  bumpAuthEpoch();

  if (result.sessionToken) {
    saveNativeAuthToken(result.sessionToken);
  }

  // Yeni oturum temiz ağ durumuyla başlasın — önceki oturumdan kalan backoff
  // veya in-flight /api/state yeni girişi engellemesin/ezmesin.
  resetRemoteFetchState();

  return memorySession;
}

// Oturumu kapat — yerel temizlik ANINDA, sunucu iptali arka planda.
// Token önce yakalanıp hemen silinir; böylece UI beklemez ve sonraki giriş
// tazelenen tokenı ezmez.
export function logoutSession() {
  const token = getStoredAuthToken();

  // 1) Yerel oturumu anında temizle
  memorySession = null;
  // Oturum nesli ilerler — logout'tan önce başlamış /api/state veya admin-customers
  // yanıtı geç gelse bile yeni (login ekranı) state'i ezemez.
  bumpAuthEpoch();
  clearAdminPinVerifiedLocally();
  clearNativeAuthToken();
  // Yönetici PII snapshot'ını da temizle — çıkışta cihazda iz kalmasın
  clearAdminSnapshot();
  // Yerel veri önbelleğini (liberteDB) temizle — müşteri/loyalty/history PII'si
  // çıkıştan sonra cihazda kalmasın. Son telefon/e-posta/deviceId korunur.
  clearLocalDb();
  // Modül seviyesindeki ağ ve Safe Mode durumunu sıfırla — eski backoff/in-flight
  // istek veya bayat Safe Mode durumu sonraki girişi engellemesin/yavaşlatmasın.
  resetRemoteFetchState();
  clearSafeModeState();

  // 2) Sunucudaki oturumu arka planda iptal et — kısa timeout, bloklamaz.
  // Token storage'dan silindiği için Authorization header açıkça verilir.
  if (!isLocalAuth() && token) {
    apiJson('/api/auth/session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      timeoutMs: 4000,
      skipUnauthorized: true
    }).catch(() => {
      // Sunucu iptali başarısız olsa da yerel çıkış tamamlandı
    });
  }
}

// Geriye uyumluluk — localStorage okumaz
export function readSession() {
  return memorySession;
}
