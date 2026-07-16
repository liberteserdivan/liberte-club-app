const TOKEN_KEY = 'liberteNextToken';
const META_KEY = 'liberteNextMeta';

let memoryToken = '';
let memoryMeta = null;

// Bellekteki token
export function getSessionToken() {
  return memoryToken || '';
}

export function getSessionMeta() {
  return memoryMeta;
}

// localStorage'tan anında oturum
export function restoreLocalSession() {
  try {
    memoryToken = localStorage.getItem(TOKEN_KEY) || '';
    const raw = localStorage.getItem(META_KEY);
    memoryMeta = raw ? JSON.parse(raw) : null;
  } catch {
    memoryToken = '';
    memoryMeta = null;
  }
  return memoryMeta && memoryToken
    ? { token: memoryToken, ...memoryMeta }
    : null;
}

// Login / me sonucunu uygula
export function applyAuthResult(result) {
  const token = result.sessionToken || memoryToken;
  if (!token) return null;
  memoryToken = token;
  memoryMeta = {
    customerId: result.customerId,
    customer: result.customer,
    loyalty: result.loyalty,
    isAdmin: Boolean(result.isAdmin)
  };
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(META_KEY, JSON.stringify(memoryMeta));
  } catch {
    // depolama yoksa bellek yeterli
  }
  return { token, ...memoryMeta };
}

// Yerel oturumu temizle
export function logoutLocal() {
  memoryToken = '';
  memoryMeta = null;
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(META_KEY);
  } catch {
    // ignore
  }
}
