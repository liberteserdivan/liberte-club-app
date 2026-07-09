// Web ve API kök adreslerini build-time env ile çöz

export const DEFAULT_API_ORIGIN = 'https://app.liberte.cafe';
export const DEFAULT_PUBLIC_SITE_ORIGIN = 'https://libertegastrocafe.com';

function isDevEnv() {
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    return false;
  }
}

// API origin normalize — yalnızca scheme://host[:port]
export function normalizeSiteOrigin(value, { allowInsecure = false } = {}) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const isHttps = url.protocol === 'https:';
  const isLocalHttp = url.protocol === 'http:'
    && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');

  if (!isHttps && !(allowInsecure && isLocalHttp)) return null;
  return url.origin;
}

// API kökü — native ve ayrı domaindeki web istemcisi
export function resolveConfiguredApiOrigin() {
  try {
    return normalizeSiteOrigin(import.meta.env?.VITE_API_BASE_URL, {
      allowInsecure: isDevEnv()
    }) || DEFAULT_API_ORIGIN;
  } catch {
    return DEFAULT_API_ORIGIN;
  }
}

// Kamuya açık web/PWA kökü — paylaşım, yasal sayfa, push linkleri
export function resolveConfiguredPublicSiteOrigin() {
  try {
    return normalizeSiteOrigin(import.meta.env?.VITE_PUBLIC_SITE_ORIGIN, {
      allowInsecure: isDevEnv()
    }) || DEFAULT_PUBLIC_SITE_ORIGIN;
  } catch {
    return DEFAULT_PUBLIC_SITE_ORIGIN;
  }
}

// Tarayıcıda web istemcisi API ile farklı kökende mi?
export function isCrossOriginWebClient(apiOrigin = resolveConfiguredApiOrigin()) {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(apiOrigin) && window.location.origin !== apiOrigin;
  } catch {
    return false;
  }
}
