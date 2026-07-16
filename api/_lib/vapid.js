// VAPID public key değerini temizle
export function normalizeVapidKey(raw) {
  return String(raw || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, '');
}

// Firebase Web Push public key formatını doğrula
export function isValidVapidPublicKey(key) {
  const normalized = normalizeVapidKey(key);
  if (normalized.length < 80 || normalized.length > 200) return false;
  return /^[A-Za-z0-9_-]+$/.test(normalized);
}

// Ortam değişkenlerinden geçerli VAPID anahtarını oku
export function readVapidKeyFromEnv() {
  const raw = process.env.FIREBASE_VAPID_PUBLIC_KEY
    || process.env.VITE_FIREBASE_VAPID_KEY
    || '';
  const normalized = normalizeVapidKey(raw);
  return isValidVapidPublicKey(normalized) ? normalized : '';
}
