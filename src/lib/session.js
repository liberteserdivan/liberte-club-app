import {
  apiJson,
  AUTH_REQUEST_OPTIONS,
  clearNativeAuthToken,
  getStoredAuthToken,
  hasStoredAuthToken,
  saveNativeAuthToken
} from './apiClient.js';
import { humanizeNetworkFailure } from './networkErrors.js';
import { isLocalAuth } from './devAuth.js';
import { clearAdminSnapshot } from './adminFullSnapshot.js';
import { clearLocalDb } from './db.js';
import { resetRemoteFetchState } from './remoteFetch.js';
import { clearSafeModeState } from './safeMode.js';
import { bumpAuthEpoch as bumpAuthEpochCounter, getAuthEpoch } from './authEpoch.js';
import { resetSupabaseClient } from './supabaseClient.js';
import { isNativeApp } from './platform.js';

export { getAuthEpoch } from './authEpoch.js';

// Bellekte tutulan oturum — localStorage kullanılmaz
let memorySession = null;
// Sunucu çıkış isteği uçuşta — hemen ardından login bu promise'i bekler
let pendingLogoutPromise = null;

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

// Yönetici PIN kapısı kaldırıldı — admin rolü otomatik doğrulanmış sayılır
export function isAdminSessionVerified(session) {
  return Boolean(session?.isAdmin) || Boolean(session?.adminVerified);
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

// Kısa gecikme — pooler/soğuk lambda için
function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

// Oturum bootstrap tek deneme
async function fetchBootstrapSession() {
  return apiJson('/api/auth/session', {
    ...AUTH_REQUEST_OPTIONS,
    skipUnauthorized: true
  });
}

// Geçici bootstrap yanıtı mı?
function isTransientBootstrapResponse(response, data) {
  return response.status === 503
    || data?.code === 'SESSION_TEMPORARILY_UNAVAILABLE'
    || data?.code === 'DATABASE_TRANSIENT';
}

// Oturum bootstrap tek tur sonucunu işle
function resolveBootstrapAttempt(response, data, authChangedDuringBootstrap) {
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
      message: data?.error || data?.clientMessage || 'Oturum şu an doğrulanamıyor. Giriş yapmayı deneyebilirsiniz.',
      retryable: true
    };
  }

  // 500 — oturum doğrulama hatası; giriş formu açık kalsın
  if (response.status >= 500 || data?.code === 'SESSION_RESTORE_FAILED') {
    memorySession = null;
    return {
      sessionUnavailable: true,
      code: data?.code || 'SESSION_RESTORE_FAILED',
      message: data?.error || data?.message || 'Oturum şu an doğrulanamıyor. Giriş yapmayı deneyebilirsiniz.',
      retryable: isTransientBootstrapResponse(response, data)
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
    adminVerified: Boolean(data.isAdmin) || Boolean(data.adminVerified),
    realtimeToken: data.realtimeToken || null
  };

  if (data.sessionToken) {
    saveNativeAuthToken(data.sessionToken);
  }

  return {
    session: memorySession,
    customer: data.customer || null,
    loyalty: data.loyalty || null
  };
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

  const backoffMs = (hasStoredAuthToken() && isNativeApp())
    ? [0, 450, 900]
    : [0, 700, 1400, 2200];
  let lastNetworkError = null;

  try {
    for (let attempt = 0; attempt < backoffMs.length; attempt += 1) {
      if (backoffMs[attempt] > 0) await sleep(backoffMs[attempt]);
      if (authChangedDuringBootstrap()) {
        return memorySession ? { session: memorySession } : null;
      }

      let response;
      let data;
      try {
        ({ response, data } = await fetchBootstrapSession());
      } catch (error) {
        lastNetworkError = error;
        const retryable = error?.code === 'FETCH_TIMEOUT' || error?.code === 'NETWORK_ERROR';
        if (retryable && attempt < backoffMs.length - 1) continue;
        throw error;
      }

      if (isTransientBootstrapResponse(response, data) && attempt < backoffMs.length - 1) {
        continue;
      }

      return resolveBootstrapAttempt(response, data, authChangedDuringBootstrap);
    }
  } catch (error) {
    if (authChangedDuringBootstrap()) {
      return memorySession ? { session: memorySession } : null;
    }
    memorySession = null;
    if (error?.code === 'FETCH_TIMEOUT' || error?.code === 'NETWORK_ERROR') {
      return {
        sessionUnavailable: true,
        code: error?.code || 'NETWORK_ERROR',
        message: humanizeNetworkFailure(error, { forLogin: true })
      };
    }
    return null;
  }

  if (lastNetworkError) {
    memorySession = null;
    return {
      sessionUnavailable: true,
      code: lastNetworkError?.code || 'NETWORK_ERROR',
      message: humanizeNetworkFailure(lastNetworkError, { forLogin: true })
    };
  }

  return null;
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
    adminVerified: Boolean(result.isAdmin) || Boolean(result.adminVerified),
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

// Çıkış sunucuya yazılana kadar bekle — iOS'ta hemen ardından login yarışmasını önler
export async function waitForPendingLogout() {
  if (!pendingLogoutPromise) return;
  try {
    await pendingLogoutPromise;
  } catch {
    // Yerel çıkış zaten tamamlandı
  }
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
  clearNativeAuthToken();
  resetSupabaseClient();
  // Yönetici PII snapshot'ını da temizle — çıkışta cihazda iz kalmasın
  clearAdminSnapshot();
  // Yerel veri önbelleğini (liberteDB) temizle — müşteri/loyalty/history PII'si
  // çıkıştan sonra cihazda kalmasın. Son telefon/e-posta/deviceId korunur.
  clearLocalDb();
  // Modül seviyesindeki ağ ve Safe Mode durumunu sıfırla — eski backoff/in-flight
  // istek veya bayat Safe Mode durumu sonraki girişi engellemesin/yavaşlatmasın.
  resetRemoteFetchState();
  clearSafeModeState();

  // 2) Sunucudaki oturumu iptal et — native'de kısa süre beklenir (re-login yarışması)
  if (!isLocalAuth() && token) {
    const logoutRequest = apiJson('/api/auth/session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      timeoutMs: isNativeApp() ? 6000 : 4000,
      skipUnauthorized: true,
      omitAuth: true
    }).catch(() => {
      // Sunucu iptali başarısız olsa da yerel çıkış tamamlandı
    }).finally(() => {
      if (pendingLogoutPromise === logoutRequest) {
        pendingLogoutPromise = null;
      }
    });
    pendingLogoutPromise = logoutRequest;
  } else {
    pendingLogoutPromise = null;
  }
}

// Geriye uyumluluk — localStorage okumaz
export function readSession() {
  return memorySession;
}

const LAST_PHONE_KEY = 'liberteLastPhone';
const LAST_PIN_KEY = 'liberteDevicePin';

// Kayıtlı telefonu oku
export function readSavedPhone() {
  try {
    return localStorage.getItem(LAST_PHONE_KEY) || '';
  } catch {
    return '';
  }
}

// Kayıtlı PIN'i oku (cihazda hızlı açılış)
export function readSavedPin() {
  try {
    return localStorage.getItem(LAST_PIN_KEY) || '';
  } catch {
    return '';
  }
}

// Hızlı giriş bilgisi var mı?
export function hasQuickLogin() {
  const phone = String(readSavedPhone()).replace(/\D/g, '');
  const pin = String(readSavedPin()).replace(/\D/g, '');
  return phone.length >= 10 && (pin.length === 4 || pin.length === 6);
}

// Başarılı girişten sonra cihaza kaydet
export function saveQuickLogin(phone, pin) {
  try {
    const ph = String(phone || '').replace(/\D/g, '');
    const p = String(pin || '').replace(/\D/g, '');
    if (ph.length >= 10) localStorage.setItem(LAST_PHONE_KEY, ph);
    if (p.length === 4 || p.length === 6) localStorage.setItem(LAST_PIN_KEY, p);
  } catch {
    // Depolama kapalıysa sessizce geç
  }
}

// Hesap silme — PIN'i temizle
export function clearQuickLoginPin() {
  try {
    localStorage.removeItem(LAST_PIN_KEY);
  } catch {
    // yoksay
  }
}
