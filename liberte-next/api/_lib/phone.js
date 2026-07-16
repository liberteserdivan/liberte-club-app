// Türkiye telefon — 10 hane 5XXXXXXXXX
export function cleanPhone(v = '') {
  let digits = String(v || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('90') && digits.length >= 12) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length > 10) digits = digits.slice(-10);
  return digits;
}

// SQL araması için olası telefon varyantları
export function phoneLookupVariants(input) {
  const normalized = cleanPhone(input);
  if (!normalized) return [];
  const rawDigits = String(input || '').replace(/\D/g, '');
  return [...new Set([
    normalized,
    `0${normalized}`,
    `90${normalized}`,
    `+90${normalized}`,
    rawDigits
  ].filter(Boolean))];
}
