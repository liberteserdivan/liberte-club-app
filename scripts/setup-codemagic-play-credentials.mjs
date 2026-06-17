#!/usr/bin/env node
/**
 * Codemagic — Play Console servis hesabi JSON dosyasini ortam degiskeninden yazar.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'android', 'play-console-service-account.json');

function fail(message) {
  console.error(`[codemagic-play] ${message}`);
  process.exit(1);
}

const raw =
  process.env.PLAY_STORE_SERVICE_ACCOUNT_JSON ||
  process.env.ANDROID_PUBLISHER_CREDENTIALS ||
  '';

const content = String(raw).trim();
if (!content) {
  fail('PLAY_STORE_SERVICE_ACCOUNT_JSON eksik — Codemagic Environment variables ekle');
}

try {
  JSON.parse(content);
} catch {
  fail('PLAY_STORE_SERVICE_ACCOUNT_JSON gecerli JSON degil');
}

writeFileSync(target, `${content}\n`, 'utf8');
console.log('[codemagic-play] play-console-service-account.json hazir.');
