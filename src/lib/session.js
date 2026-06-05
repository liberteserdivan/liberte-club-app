import { apiJson, clearNativeAuthToken, saveNativeAuthToken } from './apiClient.js';
import { useLocalAuth } from './devAuth.js';

// Bellekte tutulan oturum — localStorage kullanılmaz
let memorySession = null;

export function getMemorySession() {
  return memorySession;
}

export function setMemorySession(session) {
  memorySession = session;
}

// Sunucudan oturumu doğrula
export async function bootstrapSession() {
  if (useLocalAuth()) {
    return memorySession;
  }

  try {
    const { response, data } = await apiJson('/api/auth/session');
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
    return memorySession;
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
