// APNs cihaz tokenı — 64 hex karakter (FCM ile uyumsuz)
export function isApnsDeviceToken(token) {
  const normalized = String(token || '').trim();
  return /^[0-9a-f]{64}$/i.test(normalized);
}

// FCM kayıt tokenı — Firebase Admin sendEachForMulticast ile uyumlu
export function isFcmRegistrationToken(token) {
  const normalized = String(token || '').trim();
  if (!normalized || normalized.length < 100) return false;
  if (isApnsDeviceToken(normalized)) return false;
  return true;
}

// Token türünü kısa etiketle
export function detectPushTokenType(token) {
  if (isFcmRegistrationToken(token)) return 'fcm';
  if (isApnsDeviceToken(token)) return 'apns';
  return 'unknown';
}
