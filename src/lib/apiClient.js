import { isNativeApp } from './platform.js';

const TOKEN_KEY = 'liberteAuthToken';
// Native uygulama localhost'tan servis edilir; API istekleri canlı sunucuya gider
const NATIVE_API_ORIGIN = 'https://app.liberte.cafe';

// İstek yolunu tam URL'ye çevir
function resolveApiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  if (isNativeApp()) {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return `${NATIVE_API_ORIGIN}${normalized}`;
  }
  return path;
}

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

const FETCH_TIMEOUT_MS = 12000;

// Fetch isteğine üst zaman sınırı ekle
function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const { signal: userSignal, ...rest } = options;
  if (userSignal) {
    userSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  return fetch(url, { ...rest, signal: controller.signal }).finally(() => {
    clearTimeout(timer);
  });
}

// Kimlik bilgili API isteği
export async function apiFetch(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const token = readNativeAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const native = isNativeApp();
  const url = resolveApiUrl(path);

  try {
    const response = await fetchWithTimeout(url, {
      ...options,
      headers,
      // Native uygulama Bearer token kullanır; çapraz köken cookie gönderilmez
      credentials: native ? 'omit' : 'include'
    });
    return response;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Sunucu yanıt vermedi. Bağlantını kontrol edip tekrar dene.');
    }
    if (native && error?.message === 'Failed to fetch') {
      throw new Error('Sunucuya bağlanılamadı. İnternet bağlantını kontrol et.');
    }
    throw error;
  }
}

// JSON API isteği — sunucu HTML hata dönerse güvenli parse
export async function apiJson(path, options = {}) {
  const response = await apiFetch(path, options);
  const text = await response.text();
  let data = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = {
        error: response.ok
          ? 'Sunucu yanıtı okunamadı.'
          : 'Sunucu geçici olarak yanıt veremedi. Biraz sonra tekrar dene.'
      };
    }
  }

  return { response, data };
}
