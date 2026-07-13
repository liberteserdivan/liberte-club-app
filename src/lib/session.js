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

const SESSION_META_KEY = 'liberteSessionMeta';

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
  persistSessionMeta(memorySession, patch.customer, patch.loyalty);
  return memorySession;
}

// İnce müşteri özeti — PII minimum (anında açılış)
function thinCustomerSnapshot(customer) {
  if (!customer?.id) return null;
  return {
    id: Number(customer.id),
    name: String(customer.name || ''),
    phone: String(customer.phone || ''),
    email: String(customer.email || ''),
    isAdmin: Boolean(customer.isAdmin),
    birthDate: customer.birthDate || '',
    referralCode: customer.referralCode || null
  };
}

function thinLoyaltySnapshot(loyalty) {
  if (!loyalty || typeof loyalty !== 'object') return null;
  return {
    customerId: loyalty.customerId != null ? Number(loyalty.customerId) : undefined,
    schemaVersion: Number(loyalty.schemaVersion || 2),
    lpBalance: Math.max(0, Math.trunc(Number(loyalty.lpBalance || 0))),
    lpLifetime: Math.max(0, Math.trunc(Number(loyalty.lpLifetime || 0))),
    level: String(loyalty.level || 'Bronze'),
    usedRewards: Math.max(0, Math.trunc(Number(loyalty.usedRewards || 0)))
  };
}

// Native açılış için oturum metasını yaz
function persistSessionMeta(session, customer = null, loyalty = null) {
  if (!isNativeApp() || !session?.customerId) return;
  try {
    const payload = {
      customerId: Number(session.customerId),
      role: session.role || 'user',
      isAdmin: Boolean(session.isAdmin),
      adminVerified: Boolean(session.adminVerified) || Boolean(session.isAdmin),
      customer: thinCustomerSnapshot(customer),
      loyalty: thinLoyaltySnapshot(loyalty),
      savedAt: Date.now()
    };
    localStorage.setItem(SESSION_META_KEY, JSON.stringify(payload));
  } catch {
    // Depolama kapalıysa sessizce geç
  }
}

function clearSessionMeta() {
  try {
    localStorage.removeItem(SESSION_META_KEY);
  } catch {
    // yoksay
  }
}

function readSessionMeta() {
  try {
    const raw = localStorage.getItem(SESSION_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.customerId) return null;
    return parsed;
  } catch {
    return null;
  }
}

// Token + meta varsa ağı beklemeden oturumu geri yükle (yalnız native)
export function restoreLocalSessionFromStorage() {
  if (isLocalAuth() || !isNativeApp()) return null;
  if (!hasStoredAuthToken()) return null;

  const meta = readSessionMeta();
  if (!meta?.customerId) return null;

  memorySession = {
    customerId: Number(meta.customerId),
    role: meta.role || 'user',
    isAdmin: Boolean(meta.isAdmin),
    adminVerified: Boolean(meta.isAdmin) || Boolean(meta.adminVerified),
    realtimeToken: null
  };

  return {
    session: memorySession,
    customer: meta.customer || null,
    loyalty: meta.loyalty || null
  };
}

// Kısa gecikme — pooler/soğuk lambda için
function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

// Oturum bootstrap tek deneme
async function fetchBootstrapSession() {
  return apiJson('/api/auth/session', {
    ...AUTH_REQUEST_OPTIONS,
    timeoutMs: isNativeApp() ? 4_000 : AUTH_REQUEST_OPTIONS.timeoutMs,
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
    clearSessionMeta();
    clearNativeAuthToken();
    return null;
  }

  // 503 — geçici DB; yerel oturum varsa koru (anında açılış)
  if (response.status === 503) {
    if (memorySession) return { session: memorySession, softUnavailable: true };
    return {
      sessionUnavailable: true,
      code: data?.code || 'SESSION_TEMPORARILY_UNAVAILABLE',
      message: data?.error || data?.clientMessage || 'Oturum şu an doğrulanamıyor. Giriş yapmayı deneyebilirsiniz.',
      retryable: true
    };
  }

  // 500 — oturum doğrulama hatası; yerel varsa koru
  if (response.status >= 500 || data?.code === 'SESSION_RESTORE_FAILED') {
    if (memorySession) return { session: memorySession, softUnavailable: true };
    return {
      sessionUnavailable: true,
      code: data?.code || 'SESSION_RESTORE_FAILED',
      message: data?.error || data?.message || 'Oturum şu an doğrulanamıyor. Giriş yapmayı deneyebilirsiniz.',
      retryable: isTransientBootstrapResponse(response, data)
    };
  }

  if (!response.ok || !data?.ok) {
    if (memorySession) return { session: memorySession, softUnavailable: true };
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

  persistSessionMeta(memorySession, data.customer || null, data.loyalty || null);

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
  const hadLocalSession = Boolean(memorySession);

  // Bootstrap bitmeden login/logout olduysa bellek oturumunu ezme
  function authChangedDuringBootstrap() {
    return getAuthEpoch() !== epochAtStart;
  }

  // Yerel oturum varken tek deneme — PIN login yarışmasın
  const backoffMs = hadLocalSession
    ? [0]
    : ((hasStoredAuthToken() && isNativeApp()) ? [0, 400] : [0, 700]);
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
    if (memorySession && (error?.code === 'FETCH_TIMEOUT' || error?.code === 'NETWORK_ERROR')) {
      return { session: memorySession, softUnavailable: true };
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
    if (memorySession) return { session: memorySession, softUnavailable: true };
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

  persistSessionMeta(memorySession, result.customer || null, result.loyalty || null);

  // Yeni oturum temiz ağ durumuyla başlasın — önceki oturumdan kalan backoff
  // veya in-flight /api/state yeni girişi engellemesin/ezmesin.
  resetRemoteFetchState();

  return memorySession;
}

// Çıkış sunucuya yazılana kadar bekle — en fazla 1.5sn; login'i dakikalarca kilitleme
export async function waitForPendingLogout() {
  if (!pendingLogoutPromise) return;
  try {
    await Promise.race([
      pendingLogoutPromise,
      new Promise((resolve) => { setTimeout(resolve, 1500); })
    ]);
  } catch {
    // Yerel çıkış zaten tamamlandı
  }
}

// Oturumu kapat — yerel temizlik ANINDA, sunucu iptali arka planda.
export function logoutSession() {
  const token = getStoredAuthToken();

  // 1) Yerel oturumu anında temizle
  memorySession = null;
  bumpAuthEpoch();
  clearNativeAuthToken();
  clearSessionMeta();
  resetSupabaseClient();
  clearAdminSnapshot();
  clearLocalDb();
  resetRemoteFetchState();
  clearSafeModeState();

  // 2) Sunucudaki oturumu iptal et — native'de kısa süre beklenir
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
