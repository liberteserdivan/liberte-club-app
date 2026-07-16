// Türkiye telefon numarasını 10 haneli forma getir (5XXXXXXXXX)
export function cleanPhone(v = '') {
  let digits = String(v || '').replace(/\D/g, '');
  if (!digits) return '';

  // +90 / 90 ülke kodu
  if (digits.startsWith('90') && digits.length >= 12) {
    digits = digits.slice(2);
  }

  // Baştaki 0
  if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  // Fazla hane — son 10 hane
  if (digits.length > 10) {
    digits = digits.slice(-10);
  }

  return digits;
}

// Geriye dönük alias
export const normalizePhone = cleanPhone;

// TR cep telefonu formatı
export function isValidTrMobilePhone(phone) {
  const normalized = cleanPhone(phone);
  return normalized.length === 10 && normalized.startsWith('5');
}

// SQL araması için olası telefon varyantları
export function phoneLookupVariants(input) {
  const normalized = cleanPhone(input);
  if (!normalized) return [];

  const rawDigits = String(input || '').replace(/\D/g, '');
  const variants = new Set([
    normalized,
    `0${normalized}`,
    `90${normalized}`,
    `+90${normalized}`,
    rawDigits
  ]);

  if (rawDigits.startsWith('90')) {
    variants.add(rawDigits.slice(2));
    variants.add(`0${rawDigits.slice(2)}`);
  }

  return [...variants].filter(Boolean);
}
