import { getSessionToken } from './session.js';

const TIMEOUT_MS = 12000;

// JSON API çağrısı — Bearer + timeout
export async function apiJson(path, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const headers = {
    'Content-Type': 'application/json',
    ...(opts.headers || {})
  };
  const token = getSessionToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(path, {
      ...opts,
      headers,
      signal: controller.signal
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { ok: false, error: 'Geçersiz yanıt' };
    }
    return { status: res.status, ok: res.ok, data };
  } finally {
    clearTimeout(timer);
  }
}
