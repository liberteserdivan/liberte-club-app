const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_PREFIX = 'LC';
const CODE_LENGTH = 6;

function pickChar(value) {
  return CODE_CHARS[value % CODE_CHARS.length];
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
    return bytes;
  }
  for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}

// Tek rastgele referans kodu üret (LC + 6 karakter)
export function generateReferralCode() {
  const bytes = randomBytes(CODE_LENGTH);
  let code = CODE_PREFIX;
  for (let i = 0; i < CODE_LENGTH; i++) code += pickChar(bytes[i]);
  return code;
}

// Mevcut kodlarla çakışmayan benzersiz kod üret
export function generateUniqueReferralCode(customers = []) {
  const existing = new Set(
    customers.map((c) => String(c?.referralCode || '').toUpperCase()).filter(Boolean)
  );
  for (let i = 0; i < 25; i++) {
    const code = generateReferralCode();
    if (!existing.has(code)) return code;
  }
  return `${generateReferralCode()}${String(Date.now()).slice(-2)}`;
}

// Eski kayıtlar için sabit geriye dönük kod (id tabanlı)
export function legacyReferralCode(customer) {
  const id = Number(customer?.id) || 0;
  let seed = (id * 9973 + 42069) >>> 0;
  let code = CODE_PREFIX;
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += pickChar(seed);
    seed = Math.floor(seed / CODE_CHARS.length) + id;
  }
  return code;
}
