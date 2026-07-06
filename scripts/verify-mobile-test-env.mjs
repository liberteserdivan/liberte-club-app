#!/usr/bin/env node
/** Mobil smoke test on kosul kontrolu — secret degerleri loglamaz */
const REQUIRED = [
  'BROWSERSTACK_USERNAME',
  'BROWSERSTACK_ACCESS_KEY',
  'MOBILE_TEST_PHONE',
  'MOBILE_TEST_PIN'
];
const OPTIONAL = ['MOBILE_TEST_ADMIN_PIN', 'MOBILE_SMOKE_P0_ONLY'];
const APP_ANY = [
  'MOBILE_ANDROID_APK_PATH',
  'BROWSERSTACK_APP_ANDROID_URL',
  'BROWSERSTACK_ANDROID_APP_URL',
  'MOBILE_IOS_IPA_PATH',
  'BROWSERSTACK_APP_IOS_URL',
  'BROWSERSTACK_IOS_APP_URL'
];

function present(key) {
  return Boolean(String(process.env[key] || '').trim());
}

function main() {
  const missing = REQUIRED.filter((key) => !present(key));
  const hasApp = APP_ANY.some(present);

  for (const key of [...REQUIRED, ...OPTIONAL, ...APP_ANY]) {
    console.log(`[mobile-env] ${key}: ${present(key) ? 'present' : 'missing'}`);
  }

  if (missing.length) {
    console.error('');
    console.error(`Eksik zorunlu env: ${missing.join(', ')}`);
    console.error('Codemagic -> liberte_android grubuna ekleyin.');
    process.exit(1);
  }

  if (!hasApp) {
    console.error('');
    console.error('App yolu veya bs:// URL yok.');
    console.error('Onerilen: android-mobile-smoke workflow (APK otomatik uretir).');
    process.exit(1);
  }

  console.log('[mobile-env] On kosullar tamam');
}

main();