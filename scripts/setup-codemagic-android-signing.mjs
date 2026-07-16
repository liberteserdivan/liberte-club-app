#!/usr/bin/env node
/**
 * Codemagic Android imza — UI keystore veya env secret ile keystore.properties uretir.
 */

import { copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const targetJks = join(root, 'android', 'app', 'liberte-club-release-key.jks');
const propsPath = join(root, 'android', 'keystore.properties');

function fail(message) {
  console.error(`[codemagic-android-signing] ${message}`);
  process.exit(1);
}

function writePropsFromText(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed.includes('keyAlias=') || !trimmed.includes('storePassword=')) {
    fail('ANDROID_KEYSTORE_PROPERTIES formati yanlis (4 satir bekleniyor)');
  }
  writeFileSync(propsPath, trimmed.endsWith('\n') ? trimmed : `${trimmed}\n`, 'utf8');
}

function setupFromCodemagicKeystore() {
  const keystorePath = process.env.CM_KEYSTORE_PATH;
  const storePassword = process.env.CM_KEYSTORE_PASSWORD;
  const keyAlias = process.env.CM_KEY_ALIAS;
  const keyPassword = process.env.CM_KEY_PASSWORD;

  if (!keystorePath || !storePassword || !keyAlias || !keyPassword) {
    return false;
  }

  if (!existsSync(keystorePath)) {
    fail(`Keystore bulunamadi: ${keystorePath}`);
  }

  if (keystorePath !== targetJks) {
    copyFileSync(keystorePath, targetJks);
  }

  writeFileSync(
    propsPath,
    [
      'storeFile=app/liberte-club-release-key.jks',
      `keyAlias=${keyAlias}`,
      `storePassword=${storePassword}`,
      `keyPassword=${keyPassword}`,
      ''
    ].join('\n'),
    'utf8'
  );
  return true;
}

function setupFromEnvSecrets() {
  const base64 = String(process.env.ANDROID_KEYSTORE_BASE64 || '').trim();
  const properties = process.env.ANDROID_KEYSTORE_PROPERTIES;

  if (!base64 || !properties) {
    return false;
  }

  const jksBuffer = Buffer.from(base64.replace(/\s+/g, ''), 'base64');
  if (jksBuffer.length < 2000) {
    fail('ANDROID_KEYSTORE_BASE64 gecersiz veya cok kucuk');
  }

  writeFileSync(targetJks, jksBuffer);
  writePropsFromText(properties);
  return true;
}

if (!process.env.CM_BUILD_ID) {
  console.log('[codemagic-android-signing] Codemagic disi ortam, atlaniyor.');
  process.exit(0);
}

if (setupFromCodemagicKeystore()) {
  console.log('[codemagic-android-signing] Codemagic keystore ile hazir.');
  process.exit(0);
}

if (setupFromEnvSecrets()) {
  console.log('[codemagic-android-signing] Env secret ile hazir.');
  process.exit(0);
}

fail(
  'Imza bulunamadi — ya Code signing → liberte_club_release yukle, ya da ANDROID_KEYSTORE_BASE64 + ANDROID_KEYSTORE_PROPERTIES env ekle'
);
