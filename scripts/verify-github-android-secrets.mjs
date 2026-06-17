#!/usr/bin/env node
/**
 * GitHub Actions Android publish — gerekli secret varligini dogrular (icerik yazdirilmaz).
 */

const REQUIRED = [
  'GOOGLE_SERVICE_INFO_PLIST',
  'GOOGLE_SERVICES_JSON',
  'ANDROID_KEYSTORE_BASE64',
  'ANDROID_KEYSTORE_PROPERTIES',
  'PLAY_STORE_SERVICE_ACCOUNT_JSON'
];

const missing = REQUIRED.filter((name) => !String(process.env[name] || '').trim());

if (missing.length > 0) {
  console.error('[android-ci] Eksik GitHub secret:');
  for (const name of missing) {
    console.error(`  - ${name}`);
  }
  console.error('[android-ci] Settings → Secrets and variables → Actions');
  process.exit(1);
}

console.log('[android-ci] Gerekli secret alanlari dolu.');
