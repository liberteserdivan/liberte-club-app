// Girdi doğrulama yardımcıları — body boyutu, string uzunluğu ve enum kontrolü
// Tek sorumluluk: gelen kullanıcı verisini güvenli sınırlara çekmek.

// Maksimum ham istek gövdesi boyutu (byte) — aşırı büyük payload reddedilir
export const MAX_BODY_BYTES = 16 * 1024;

// String'i kırp — null/sayı güvenli; üst uzunluk sınırı uygulanır
export function clampString(value, maxLength) {
  if (value == null) return '';
  const text = String(value);
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

// Değer izinli listede mi — değilse varsayılan döner
export function oneOfOrDefault(value, allowed, fallback) {
  const text = String(value || '').trim().toLowerCase();
  return allowed.includes(text) ? text : fallback;
}

// Gövde boyutu sınırı aşıldı mı — byte cinsinden ölçer
export function isBodyTooLarge(body, maxBytes = MAX_BODY_BYTES) {
  if (body == null) return false;
  try {
    const raw = typeof body === 'string' ? body : JSON.stringify(body);
    return Buffer.byteLength(raw, 'utf8') > maxBytes;
  } catch {
    return false;
  }
}
