// Türkiye telefon numarasını tek formata getir
export function cleanPhone(v = '') {
  let digits = String(v || '').replace(/\D/g, '');
  if (digits.startsWith('90') && digits.length > 10) digits = digits.slice(2);
  if (digits.startsWith('0') && digits.length > 10) digits = digits.slice(1);
  if (digits.length > 10) digits = digits.slice(-10);
  return digits;
}
