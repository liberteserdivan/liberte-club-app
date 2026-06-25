import {
  apiJson,
  AUTH_REQUEST_OPTIONS,
  clearNativeAuthToken,
  hasStoredAuthToken,
  saveNativeAuthToken
} from './apiClient.js';
import { useLocalAuth } from './devAuth.js';

// Bellekte tutulan oturum — localStorage kullanılmaz
let memorySession = null;

export function getRealtimeToken() {
  return memorySession?.realtimeToken || null;
}

export function getMemorySession() {
  return memorySession;
}

export function setMemorySession(session) {
  memorySession = session;
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

// Sunucudan oturumu doğrula
export async function bootstrapSession() {
  if (useLocalAuth()) {
    return memorySession ? { session: memorySession } : null;
  }

  try {
    const { response, data } = await apiJson('/api/auth/session', {
      ...AUTH_REQUEST_OPTIONS,
      skipUnauthorized: true
    });
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

    if (data.sessionToken) {
      saveNativeAuthToken(data.sessionToken);
    }

    return {
      session: memorySession,
      customer: data.customer || null,
      loyalty: data.loyalty || null
    };
  } catch {
    memorySession = null;
    return null;
  }
}

// Cookie oturumu varsa Bearer tokenı storage'a yaz — QR/native için
export async function hydrateSessionTokenFromServer() {
  if (useLocalAuth() || hasStoredAuthToken()) {
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

  if (result.sessionToken) {
    saveNativeAuthToken(result.sessionToken);
  }

  return memorySession;
}

// Oturumu kapat — native'de token POST sonrası silinir
export async function logoutSession() {
  memorySession = null;
  clearAdminPinVerifiedLocally();

  if (!useLocalAuth()) {
    try {
      await apiJson('/api/auth/session', { method: 'POST', ...AUTH_REQUEST_OPTIONS });
    } catch {
      // Yerel temizlik yine de yapılır
    }
  }

  clearNativeAuthToken();
}

// Geriye uyumluluk — localStorage okumaz
export function readSession() {
  return memorySession;
}
