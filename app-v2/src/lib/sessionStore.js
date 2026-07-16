import { bumpAuthEpoch } from './authEpoch.js';
import { clearAuthToken, setAuthToken } from './apiClient.js';

const LAST_PHONE_KEY = 'liberteLastPhone';
// Eski düz-metin PIN — artık yazılmaz
const LEGACY_PIN_KEY = 'liberteDevicePin';

let memorySession = null;

export function getSession() {
  return memorySession;
}

export function applyAuthResult(data = {}) {
  bumpAuthEpoch();
  if (data.sessionToken) setAuthToken(data.sessionToken);
  memorySession = {
    customerId: data.customerId ?? null,
    role: data.role || 'user',
    isAdmin: Boolean(data.isAdmin),
    adminVerified: Boolean(data.adminVerified),
    realtimeToken: data.realtimeToken || null
  };
  return memorySession;
}

export function clearSession() {
  bumpAuthEpoch();
  memorySession = null;
  clearAuthToken();
}

export function readSavedPhone() {
  try { return localStorage.getItem(LAST_PHONE_KEY) || ''; } catch { return ''; }
}

export function readSavedPin() {
  return '';
}

export function hasQuickLogin() {
  const phone = String(readSavedPhone()).replace(/\D/g, '');
  return phone.length >= 10;
}

export function saveQuickLogin(phone, _pin) {
  try {
    const ph = String(phone || '').replace(/\D/g, '');
    if (ph.length >= 10) localStorage.setItem(LAST_PHONE_KEY, ph);
    localStorage.removeItem(LEGACY_PIN_KEY);
  } catch { /* yoksay */ }
}

export function clearQuickLoginPin() {
  try { localStorage.removeItem(LEGACY_PIN_KEY); } catch { /* yoksay */ }
}

export function purgeLegacyDevicePin() {
  clearQuickLoginPin();
}
