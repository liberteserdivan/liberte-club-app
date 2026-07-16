export function formatPhoneInput(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('90')) digits = digits.slice(2);
  if (digits.length > 0 && digits[0] !== '0') {
    if (digits[0] === '5') digits = `0${digits}`;
  }
  digits = digits.slice(0, 11);
  if (digits.length <= 4) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  if (digits.length <= 9) return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9, 11)}`;
}

export function formatPinInput(raw, max = 6) {
  return String(raw || '').replace(/\D/g, '').slice(0, max);
}

export function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}
