// CI ortamindan test kimlik bilgilerini okur - kodda sabit deger yok.

const REQUIRED = ['MOBILE_TEST_PHONE', 'MOBILE_TEST_PIN'];

/** Zorunlu test env degiskenlerini dogrular */
export function assertMobileTestEnv() {
  const missing = REQUIRED.filter((key) => !String(process.env[key] || '').trim());
  if (missing.length) {
    throw new Error(`Eksik mobil test env: ${missing.join(', ')}`);
  }
}

/** Telefon ve PIN - loglanmaz */
export function getMobileTestCredentials() {
  assertMobileTestEnv();
  return {
    phone: String(process.env.MOBILE_TEST_PHONE).trim(),
    pin: String(process.env.MOBILE_TEST_PIN).trim()
  };
}

/** BrowserStack kimlik bilgileri */
export function getBrowserStackAuth() {
  const username = String(process.env.BROWSERSTACK_USERNAME || '').trim();
  const accessKey = String(process.env.BROWSERSTACK_ACCESS_KEY || '').trim();
  if (!username || !accessKey) {
    throw new Error('BROWSERSTACK_USERNAME / BROWSERSTACK_ACCESS_KEY gerekli');
  }
  return { username, accessKey };
}