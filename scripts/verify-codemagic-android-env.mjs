#!/usr/bin/env node
/**
 * Codemagic android-release — gerekli ortam degiskenlerini dogrular (deger yazdirilmaz).
 */

function hasValue(name) {
  return Boolean(String(process.env[name] || '').trim());
}

function hasSigningFromUi() {
  return (
    hasValue('CM_KEYSTORE_PATH') &&
    hasValue('CM_KEYSTORE_PASSWORD') &&
    hasValue('CM_KEY_ALIAS') &&
    hasValue('CM_KEY_PASSWORD')
  );
}

function hasSigningFromEnv() {
  return hasValue('ANDROID_KEYSTORE_BASE64') && hasValue('ANDROID_KEYSTORE_PROPERTIES');
}

const missing = [];

if (!hasValue('GOOGLE_SERVICES_JSON')) {
  missing.push('GOOGLE_SERVICES_JSON (Firebase android/app/google-services.json icerigi)');
}

if (!hasSigningFromUi() && !hasSigningFromEnv()) {
  missing.push(
    'Android imza — ya Code signing → liberte_club_release yukle, ya da ANDROID_KEYSTORE_BASE64 + ANDROID_KEYSTORE_PROPERTIES'
  );
}

if (!hasValue('PLAY_STORE_SERVICE_ACCOUNT_JSON')) {
  missing.push('PLAY_STORE_SERVICE_ACCOUNT_JSON (Play Console servis hesabi JSON)');
}

if (missing.length > 0) {
  console.error('[codemagic-android-env] Eksik ayarlar:');
  for (const item of missing) {
    console.error(`  - ${item}`);
  }
  console.error('');
  console.error('Codemagic → liberte-club-app → Environment variables → Add variable');
  console.error('Her degiskeni Secure isaretle. Uygulama seviyesinde ekle (workflow grubu degil).');
  console.error('Not: iOS icin GOOGLE_SERVICE_INFO_PLIST ayri; Android icin GOOGLE_SERVICES_JSON gerekli.');
  process.exit(1);
}

console.log('[codemagic-android-env] Gerekli ayarlar mevcut.');
