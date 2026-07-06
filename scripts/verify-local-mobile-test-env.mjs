#!/usr/bin/env node
/** Yerel emulator smoke — BrowserStack secret gerekmez */
const REQUIRED = ['MOBILE_TEST_PHONE', 'MOBILE_TEST_PIN'];
const APK_ANY = ['MOBILE_ANDROID_APK_PATH'];

function present(key) {
  return Boolean(String(process.env[key] || '').trim());
}

function main() {
  const missing = REQUIRED.filter((key) => !present(key));
  const defaultApk = 'android/app/build/outputs/apk/debug/app-debug.apk';
  const hasApk = APK_ANY.some(present);

  for (const key of [...REQUIRED, ...APK_ANY, 'MOBILE_SMOKE_P0_ONLY']) {
    console.log(`[mobile-emulator-env] ${key}: ${present(key) ? 'present' : 'missing'}`);
  }

  if (missing.length) {
    console.error('');
    console.error(`Eksik zorunlu env: ${missing.join(', ')}`);
    console.error('GitHub Secrets veya yerel .env.mobile-test.local kullanin.');
    process.exit(1);
  }

  if (!hasApk) {
    console.log(`[mobile-emulator-env] APK: once ${defaultApk} uretilecek (assembleDebug)`);
  }

  console.log('[mobile-emulator-env] OK');
}

main();