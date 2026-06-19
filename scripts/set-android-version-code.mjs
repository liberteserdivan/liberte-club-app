#!/usr/bin/env node
/**
 * Codemagic — Android versionCode ve versionName degerlerini gunceller.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gradlePath = join(root, 'android', 'app', 'build.gradle');
const minCode = Number(process.env.ANDROID_MIN_VERSION_CODE || 27);
const buildNumber = Number(process.env.BUILD_NUMBER || 0);
const versionCode = Math.max(minCode, buildNumber || minCode);
const versionName = String(process.env.APP_VERSION || '1.1.2').trim();

let content = readFileSync(gradlePath, 'utf8');

if (!content.match(/versionCode\s+\d+/)) {
  console.error('[android-version] versionCode satiri bulunamadi.');
  process.exit(1);
}

if (!content.match(/versionName\s+"[^"]+"/)) {
  console.error('[android-version] versionName satiri bulunamadi.');
  process.exit(1);
}

content = content.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
content = content.replace(/versionName\s+"[^"]+"/, `versionName "${versionName}"`);
writeFileSync(gradlePath, content, 'utf8');

console.log(`[android-version] versionCode ${versionCode}, versionName ${versionName} (BUILD_NUMBER=${buildNumber || 'yok'})`);
