const CODE_PREFIX = 'liberteAuthCode:';

// Yerel geliştirmede PIN hash deposu — düz metin tutulmaz
const devPinStore = new Map();

function normPhone(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('90') && digits.length > 10) digits = digits.slice(2);
  if (digits.startsWith('0') && digits.length > 10) digits = digits.slice(1);
  if (digits.length > 10) digits = digits.slice(-10);
  return digits;
}

// PIN formatı — 4 veya 6 hane
export function isValidDevPin(pin) {
  const value = String(pin || '').replace(/\D/g, '');
  return value.length === 4 || value.length === 6;
}

// Dev ortamında PIN hash üret
async function hashDevPin(pin) {
  const data = new TextEncoder().encode(String(pin).replace(/\D/g, ''));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Yerel kayıt için PIN hash kaydet
export async function registerDevPin(phone, pin) {
  const ph = normPhone(phone);
  const hash = await hashDevPin(pin);
  devPinStore.set(ph, { hash, failed: 0, lockedUntil: 0 });
}

// Yerel giriş PIN doğrula
export async function verifyDevPin(phone, pin) {
  const ph = normPhone(phone);
  const entry = devPinStore.get(ph);
  if (!entry) {
    throw new Error('Bu hesap için PIN tanımlı değil. Önce kayıt ol veya PIN sıfırla.');
  }

  if (entry.lockedUntil > Date.now()) {
    const min = Math.ceil((entry.lockedUntil - Date.now()) / 60000);
    throw new Error(`Çok fazla hatalı deneme. ${min} dakika sonra tekrar dene.`);
  }

  const hash = await hashDevPin(pin);
  if (hash !== entry.hash) {
    entry.failed += 1;
    if (entry.failed >= 5) {
      entry.lockedUntil = Date.now() + 10 * 60 * 1000;
      throw new Error('Çok fazla hatalı deneme. Hesap 10 dakika kilitlendi.');
    }
    throw new Error(`PIN hatalı. Kalan deneme: ${5 - entry.failed}.`);
  }

  entry.failed = 0;
  entry.lockedUntil = 0;
  return true;
}

// PIN sıfırlama kodu üret (yalnızca dev)
export function makeDevAuthCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function saveDevAuthCode(phone, email, code) {
  sessionStorage.setItem(`${CODE_PREFIX}${normPhone(phone)}:${email}`, JSON.stringify({
    code,
    expires: Date.now() + 10 * 60 * 1000
  }));
}

export function verifyDevAuthCode(phone, email, code) {
  const raw = sessionStorage.getItem(`${CODE_PREFIX}${normPhone(phone)}:${email}`);
  if (!raw) throw new Error('Aktif kod bulunamadı. Yeni kod iste.');

  const entry = JSON.parse(raw);
  const normalized = String(code || '').replace(/\D/g, '');

  if (Date.now() > entry.expires) throw new Error('Kod süresi doldu. Yeni kod iste.');
  if (entry.code !== normalized) throw new Error('Kod hatalı');

  sessionStorage.removeItem(`${CODE_PREFIX}${normPhone(phone)}:${email}`);
  return true;
}

export const useLocalAuth = () => import.meta.env.DEV;

// Yönetici PIN — müşteri PIN sisteminden ayrı (yalnızca dev)
export function verifyDevAdminPin(pin) {
  const expected = String(import.meta.env.VITE_DEV_ADMIN_PIN || '5454').trim();
  if (String(pin || '').trim() !== expected) {
    throw new Error('Yönetici PIN hatalı');
  }
  return true;
}
