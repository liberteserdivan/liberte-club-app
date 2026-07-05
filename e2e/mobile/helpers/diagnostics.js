// Guvenli tani — hassas alanlar asla loglanmaz

const FORBIDDEN_KEYS = new Set([
  'authorization',
  'sessiontoken',
  'realtimetoken',
  'pin',
  'adminpin',
  'phone',
  'email',
  'customers',
  'body'
]);

const API_HOST = process.env.MOBILE_API_HOST || 'https://liberte-club-app.vercel.app';

/** Log nesnesinde yasak anahtar var mi */
export function assertSafeLogPayload(payload) {
  const keys = Object.keys(payload).map((k) => k.toLowerCase());
  for (const key of keys) {
    if (FORBIDDEN_KEYS.has(key)) {
      throw new Error(`Guvenli olmayan log anahtari: ${key}`);
    }
  }
}

/** API cagrisi tani kaydi */
export function createApiDiagnostic({ platform, deviceName, osVersion, path, status, requestId, code, step, durationMs }) {
  const entry = {
    platform,
    deviceName,
    osVersion,
    apiHost: API_HOST,
    path,
    status,
    requestId: requestId || null,
    code: code || null,
    step: step || null,
    durationMs: typeof durationMs === 'number' ? durationMs : null
  };
  assertSafeLogPayload(entry);
  return entry;
}

/** Konsola guvenli JSON yaz */
export function logSafe(label, payload) {
  assertSafeLogPayload(payload);
  console.log(`[mobile-e2e] ${label}`, JSON.stringify(payload));
}
