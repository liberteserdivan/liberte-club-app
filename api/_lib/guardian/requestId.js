import { randomBytes } from 'node:crypto';

// Liberte Guardian — izlenebilir istek kimliği üreticisi
// Tek sorumluluk: "LBT-XXXXXX" biçiminde kısa, okunur requestId üretmek.
// Bağımlılık yok → çekirdek sqlRequest tarafından güvenle import edilebilir.

const PREFIX = 'LBT-';

// Yeni kısa kimlik — LBT- + 6 büyük hex karakter
export function createRequestId() {
  return `${PREFIX}${randomBytes(3).toString('hex').toUpperCase()}`;
}

// Gelen x-request-id geçerliyse korunur, değilse yenisi üretilir.
export function resolveRequestId(headerValue) {
  if (typeof headerValue === 'string') {
    const trimmed = headerValue.trim();
    // Yalnızca güvenli karakterleri kabul et (enjeksiyon/aşırı uzunluk engeli)
    if (/^[A-Za-z0-9-]{4,64}$/.test(trimmed)) return trimmed;
  }
  return createRequestId();
}

// Bir değerin Guardian requestId biçiminde olup olmadığını kontrol et
export function isGuardianRequestId(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}
