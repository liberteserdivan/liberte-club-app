const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

const NATIVE_APP_ORIGINS = new Set([
  'https://localhost',
  'http://localhost',
  'capacitor://localhost',
  'ionic://localhost',
  'https://localhost:8080',
  'http://localhost:8080'
]);

// Capacitor native kökeni mi
function isNativeCapacitorOrigin(origin) {
  if (!origin) return false;
  if (NATIVE_APP_ORIGINS.has(origin)) return true;
  try {
    const url = new URL(origin);
    const protocol = url.protocol.replace(':', '');
    const host = url.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') return false;
    return ['https', 'http', 'capacitor', 'ionic'].includes(protocol);
  } catch {
    return false;
  }
}

// İzin verilen Origin
function resolveOrigin(req) {
  const origin = req.headers.origin || '';
  if (!origin) return '';
  if (isNativeCapacitorOrigin(origin)) return origin;
  if (ALLOWED_ORIGINS.length === 0) {
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
      return '';
    }
    return origin;
  }
  return ALLOWED_ORIGINS.includes(origin) ? origin : '';
}

// CORS başlıkları
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

// JSON gövde oku
export function readJsonBody(req) {
  try {
    if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
    return req.body || {};
  } catch {
    return {};
  }
}

// JSON yanıt gönder
export function sendJson(res, status, body) {
  if (res.headersSent) return;
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

// Bearer token oku
export function readBearerToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return '';
}
