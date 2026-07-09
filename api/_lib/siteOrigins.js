// Sunucu tarafı site kökleri — Vercel env ile override edilir

export const DEFAULT_API_ORIGIN = 'https://app.liberte.cafe';
export const DEFAULT_PUBLIC_SITE_ORIGIN = 'https://libertegastrocafe.com';

// Kamuya açık web/PWA kökü
export function resolvePublicSiteOrigin() {
  const configured = String(process.env.PUBLIC_SITE_ORIGIN || '').trim();
  return configured || DEFAULT_PUBLIC_SITE_ORIGIN;
}

// API kökü — mobil ve cross-origin web
export function resolveApiOrigin() {
  const configured = String(process.env.API_ORIGIN || process.env.VITE_API_BASE_URL || '').trim();
  return configured || DEFAULT_API_ORIGIN;
}

// CORS whitelist — virgülle ayrılmış origin listesi
export function resolveAllowedOrigins() {
  const raw = String(process.env.ALLOWED_ORIGINS || '').trim();
  if (raw) {
    return raw.split(',').map((v) => v.trim()).filter(Boolean);
  }
  return [
    DEFAULT_PUBLIC_SITE_ORIGIN,
    'https://www.libertegastrocafe.com',
    DEFAULT_API_ORIGIN
  ];
}
