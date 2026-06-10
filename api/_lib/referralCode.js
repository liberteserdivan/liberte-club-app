import { randomBytes } from 'node:crypto';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_PREFIX = 'LC';
const CODE_LENGTH = 6;

function pickChar(byte) {
  return CODE_CHARS[byte % CODE_CHARS.length];
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

// Müşterinin geçerli referans kodunu döndür
export function getCustomerReferralCode(customer) {
  if (customer?.referralCode) return String(customer.referralCode).toUpperCase();
  return legacyReferralCode(customer);
}

// Davet koduna göre referans veren müşteriyi bul
export function findReferrerByInviteCode(customers, inviteCode) {
  const clean = String(inviteCode || '').trim().toUpperCase().replace(/\s/g, '');
  if (!clean) return null;
  return (customers || []).find((c) => getCustomerReferralCode(c) === clean) || null;
}
