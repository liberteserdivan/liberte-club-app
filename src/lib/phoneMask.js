// Türkiye telefon giriş maskesi — 0532 123 45 67

// Rakamları maskele
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

// PIN alanları — yalnızca rakam, en fazla 6 hane
export function formatPinInput(raw, max = 6) {
  return String(raw || '').replace(/\D/g, '').slice(0, max);
}

// Metinden benzersiz TR cep telefonu listesi (satır, virgül, noktalı virgül)
export function parsePhoneList(raw = '') {
  const chunks = String(raw || '')
    .split(/[\n,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const seen = new Set();
  const phones = [];

  for (const chunk of chunks) {
    let digits = chunk.replace(/\D/g, '');
    if (digits.startsWith('90') && digits.length >= 12) digits = digits.slice(2);
    if (digits.startsWith('0')) digits = digits.slice(1);
    if (digits.length > 10) digits = digits.slice(-10);
    if (digits.length !== 10 || !digits.startsWith('5')) continue;
    if (seen.has(digits)) continue;
    seen.add(digits);
    phones.push(digits);
  }

  return phones;
}
