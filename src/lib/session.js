import { apiJson, AUTH_REQUEST_OPTIONS, clearNativeAuthToken, saveNativeAuthToken } from './apiClient.js';
import { useLocalAuth } from './devAuth.js';

// Bellekte tutulan oturum — localStorage kullanılmaz
let memorySession = null;

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

// Sunucudan oturumu doğrula
export async function bootstrapSession() {
  if (useLocalAuth()) {
    return memorySession ? { session: memorySession } : null;
  }

  try {
    const { response, data } = await apiJson('/api/auth/session', AUTH_REQUEST_OPTIONS);
    if (!response.ok || !data?.ok) {
      memorySession = null;
      return null;
    }

    memorySession = {
      customerId: data.customerId,
      role: data.role,
      isAdmin: Boolean(data.isAdmin),
      adminVerified: Boolean(data.adminVerified)
    };

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

// Oturum aç
export function applyAuthResult(result) {
  memorySession = {
    customerId: result.customerId,
    role: result.role || 'user',
    isAdmin: Boolean(result.isAdmin),
    adminVerified: Boolean(result.adminVerified)
  };

  if (result.sessionToken) {
    saveNativeAuthToken(result.sessionToken);
  }

  return memorySession;
}

// Oturumu kapat
export async function logoutSession() {
  memorySession = null;
  clearNativeAuthToken();

  if (useLocalAuth()) return;

  try {
    await apiJson('/api/auth/session', { method: 'POST' });
  } catch {
    // Sessizce geç
  }
}

// Geriye uyumluluk — localStorage okumaz
export function readSession() {
  return memorySession;
}
