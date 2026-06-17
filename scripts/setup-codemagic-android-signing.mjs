#!/usr/bin/env node
/**
 * Codemagic Android imza — yuklenen keystore bilgisinden keystore.properties uretir.
 */

import { copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  console.error(`[codemagic-android-signing] ${message}`);
  process.exit(1);
}

if (!process.env.CM_BUILD_ID) {
  console.log('[codemagic-android-signing] Codemagic disi ortam, atlaniyor.');
  process.exit(0);
}

const keystorePath = process.env.CM_KEYSTORE_PATH;
const storePassword = process.env.CM_KEYSTORE_PASSWORD;
const keyAlias = process.env.CM_KEY_ALIAS;
const keyPassword = process.env.CM_KEY_PASSWORD;

if (!keystorePath || !storePassword || !keyAlias || !keyPassword) {
  fail('CM_KEYSTORE_* eksik — Codemagic UI → Code signing → Android keystore yukle');
}

const targetJks = join(root, 'android', 'app', 'liberte-club-release-key.jks');
if (!existsSync(keystorePath)) {
  fail(`Keystore bulunamadi: ${keystorePath}`);
}

if (keystorePath !== targetJks) {
  copyFileSync(keystorePath, targetJks);
}

const props = [
  'storeFile=app/liberte-club-release-key.jks',
  `keyAlias=${keyAlias}`,
  `storePassword=${storePassword}`,
  `keyPassword=${keyPassword}`,
  ''
].join('\n');

writeFileSync(join(root, 'android', 'keystore.properties'), props, 'utf8');
console.log('[codemagic-android-signing] keystore.properties hazir.');
