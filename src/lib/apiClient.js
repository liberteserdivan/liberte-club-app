import { isNativeApp } from './platform.js';

const TOKEN_KEY = 'liberteAuthToken';

// Native uygulamada httpOnly cookie yedek token
export function saveNativeAuthToken(token) {
  if (!token || !isNativeApp()) return;
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Sessizce geç
  }
}

export function clearNativeAuthToken() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Sessizce geç
  }
}

function readNativeAuthToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

// Kimlik bilgili API isteği
export async function apiFetch(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const token = readNativeAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: 'include'
  });

  return response;
}

// JSON API isteği
export async function apiJson(path, options = {}) {
  const response = await apiFetch(path, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  return { response, data };
}
