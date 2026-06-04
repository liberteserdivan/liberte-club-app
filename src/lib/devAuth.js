const KEY_PREFIX = 'liberteAuthCode:';

// Yerel geliştirmede 6 haneli kod üret
export function makeDevAuthCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Kodu oturumda sakla
export function saveDevAuthCode(phone, email, code) {
  sessionStorage.setItem(`${KEY_PREFIX}${phone}:${email}`, JSON.stringify({
    code,
    expires: Date.now() + 10 * 60 * 1000
  }));
}

// Yerel kodu doğrula
export function verifyDevAuthCode(phone, email, code) {
  const raw = sessionStorage.getItem(`${KEY_PREFIX}${phone}:${email}`);
  if (!raw) throw new Error('Aktif kod bulunamadı. Yeni kod iste.');

  const entry = JSON.parse(raw);
  const normalized = String(code || '').replace(/\D/g, '');

  if (Date.now() > entry.expires) throw new Error('Kod süresi doldu. Yeni kod iste.');
  if (entry.code !== normalized) throw new Error('Kod hatalı');

  sessionStorage.removeItem(`${KEY_PREFIX}${phone}:${email}`);
  return true;
}

// Vite dev sunucusunda API yok; yerel doğrulama kullan
export const useLocalAuth = () => import.meta.env.DEV;
