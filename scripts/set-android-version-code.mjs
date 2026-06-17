#!/usr/bin/env node
/**
 * Codemagic — Android versionCode degerini BUILD_NUMBER ile gunceller.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gradlePath = join(root, 'android', 'app', 'build.gradle');
const minCode = Number(process.env.ANDROID_MIN_VERSION_CODE || 25);
const buildNumber = Number(process.env.BUILD_NUMBER || 0);
const versionCode = Math.max(minCode, buildNumber || minCode);

const content = readFileSync(gradlePath, 'utf8');
const match = content.match(/versionCode\s+\d+/);

if (!match) {
  console.error('[android-version] versionCode satiri bulunamadi.');
  process.exit(1);
}

const next = content.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
writeFileSync(gradlePath, next, 'utf8');
console.log(`[android-version] versionCode ${versionCode} (BUILD_NUMBER=${buildNumber || 'yok'})`);
