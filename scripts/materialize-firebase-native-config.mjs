#!/usr/bin/env node
/**
 * CI/CD ve lokal release build — Firebase native config dosyalarini uretir.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const isCi = Boolean(process.env.CM_BUILD_ID || process.env.CI || process.env.CODEMAGIC);

function decodeEnvValue(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';

  if (text.startsWith('{') || text.startsWith('<?xml') || text.startsWith('<!DOCTYPE')) {
    return text;
  }

  try {
    const decoded = Buffer.from(text, 'base64').toString('utf8').trim();
    if (decoded.startsWith('{') || decoded.startsWith('<?xml') || decoded.startsWith('<!DOCTYPE')) {
      return decoded;
    }
  } catch {
    // base64 degilse devam et
  }

  return text;
}

function writeConfigFile(envName, targetPath, label, { requiredOnCi = false } = {}) {
  const raw = process.env[envName];
  const content = decodeEnvValue(raw);

  if (!content) {
    if (existsSync(targetPath)) {
      console.log(`[firebase-native] ${label} mevcut — ${envName} tanimli degil, korunuyor.`);
      return true;
    }

    const message = `[firebase-native] ${label} yok — ${envName} veya yerel dosya gerekli.`;
    if (requiredOnCi && isCi) {
      console.error(message);
      process.exit(1);
    }
    console.warn(message);
    return false;
  }

  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
  console.log(`[firebase-native] ${label} yazildi: ${targetPath}`);
  return true;
}

const iosPlistPath = join(root, 'ios', 'App', 'App', 'GoogleService-Info.plist');

writeConfigFile(
  'GOOGLE_SERVICES_JSON',
  join(root, 'android', 'app', 'google-services.json'),
  'google-services.json'
);

writeConfigFile(
  'GOOGLE_SERVICE_INFO_PLIST',
  iosPlistPath,
  'GoogleService-Info.plist',
  { requiredOnCi: true }
);

if (isCi && !existsSync(iosPlistPath)) {
  console.error('[firebase-native] CI build durduruldu: GoogleService-Info.plist bulunamadi.');
  process.exit(1);
}
