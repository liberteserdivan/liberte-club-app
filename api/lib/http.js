// API CORS ve cookie yardımcıları

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

// Capacitor native uygulama kökenleri — ALLOWED_ORIGINS'ten bağımsız izin verilir
const NATIVE_APP_ORIGINS = new Set([
  'https://localhost',
  'http://localhost',
  'capacitor://localhost',
  'ionic://localhost',
  'https://localhost:8080',
  'http://localhost:8080'
]);

// İstek kaynağını doğrula
export function resolveOrigin(req) {
  const origin = req.headers.origin || '';
  if (!origin) return '';
  if (NATIVE_APP_ORIGINS.has(origin)) return origin;
  if (ALLOWED_ORIGINS.length === 0) return origin;
  return ALLOWED_ORIGINS.includes(origin) ? origin : '';
}

// CORS başlıklarını ayarla — kimlik bilgisi destekli
export function applyCors(req, res, methods = 'GET,POST,OPTIONS') {
  const origin = resolveOrigin(req);
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// JSON gövdesini oku
export function readBody(req) {
  return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
}
