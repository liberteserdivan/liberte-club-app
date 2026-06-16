#!/usr/bin/env node
/**
 * CI/CD ve lokal release build — Firebase native config dosyalarını üretir.
 * Ortam değişkenleri:
 *   GOOGLE_SERVICES_JSON        — android/app/google-services.json (ham JSON veya base64)
 *   GOOGLE_SERVICE_INFO_PLIST   — ios/App/App/GoogleService-Info.plist (ham XML veya base64)
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Ortam değişkeninden dosya içeriğini çöz
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
    // base64 değilse ham metin olarak devam et
  }

  return text;
}

// Hedef dosyayı yaz — mevcut dosyayı ezme seçeneği
function writeConfigFile(envName, targetPath, label) {
  const raw = process.env[envName];
  const content = decodeEnvValue(raw);

  if (!content) {
    if (existsSync(targetPath)) {
      console.log(`[firebase-native] ${label} mevcut — ${envName} tanımlı değil, korunuyor.`);
      return true;
    }
    console.warn(`[firebase-native] ${label} yok — ${envName} veya yerel dosya gerekli.`);
    return false;
  }

  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
  console.log(`[firebase-native] ${label} yazıldı: ${targetPath}`);
  return true;
}

const androidOk = writeConfigFile(
  'GOOGLE_SERVICES_JSON',
  join(root, 'android', 'app', 'google-services.json'),
  'google-services.json'
);

const iosOk = writeConfigFile(
  'GOOGLE_SERVICE_INFO_PLIST',
  join(root, 'ios', 'App', 'App', 'GoogleService-Info.plist'),
  'GoogleService-Info.plist'
);

if (!androidOk && !iosOk) {
  console.warn('[firebase-native] Native push için en az bir config dosyası gerekli.');
}
