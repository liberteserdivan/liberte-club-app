#!/usr/bin/env node
/**
 * Play Console'a imzali AAB yukler (Gradle Play Publisher).
 * Kullanim:
 *   node scripts/publish-android-play.mjs [track] [--build]
 * Ornek:
 *   node scripts/publish-android-play.mjs internal --build
 *   node scripts/publish-android-play.mjs production
 */

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const androidDir = path.join(root, 'android');
const credFile = path.join(androidDir, 'play-console-service-account.json');
const validTracks = new Set(['internal', 'alpha', 'beta', 'production']);

const args = process.argv.slice(2);
const shouldBuild = args.includes('--build');
const trackArg = args.find((a) => !a.startsWith('--'));
const track = trackArg || process.env.PLAY_TRACK || 'internal';

if (!validTracks.has(track)) {
  console.error(`Gecersiz kanal: ${track}. Secenekler: ${[...validTracks].join(', ')}`);
  process.exit(1);
}

// Kimlik bilgisi: JSON dosyasi veya ortam degiskeni
const hasCredentials = existsSync(credFile) || Boolean(process.env.ANDROID_PUBLISHER_CREDENTIALS);
if (!hasCredentials) {
  console.error('Play Console kimlik bilgisi bulunamadi.');
  console.error(`  Dosya: ${credFile}`);
  console.error('  veya ANDROID_PUBLISHER_CREDENTIALS ortam degiskeni');
  console.error('Kurulum: docs/PLAY_STORE_YUKLEME.md');
  process.exit(1);
}

function run(command, commandArgs, cwd) {
  const result = spawnSync(command, commandArgs, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (shouldBuild) {
  console.log('> Firebase native config dosyalari hazirlaniyor...');
  run('node', ['scripts/materialize-firebase-native-config.mjs'], root);
  console.log('> Web build + AAB derleniyor...');
  const buildScript = process.env.CI ? 'build:release' : 'build';
  run('npm', ['run', buildScript], root);
  run('node', ['scripts/generate-android-icons.mjs'], root);
  run('npx', ['cap', 'sync', 'android'], root);
  const gradle = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  run(gradle, ['bundleRelease'], androidDir);
}

const javaHome =
  process.env.JAVA_HOME ||
  (process.platform === 'win32' ? 'C:\\Program Files\\Android\\Android Studio\\jbr' : null);
if (javaHome) {
  process.env.JAVA_HOME = javaHome;
}

console.log(`> Play Console'a yukleniyor (kanal: ${track})...`);
run(
  process.platform === 'win32' ? 'gradlew.bat' : './gradlew',
  ['publishReleaseBundle', `--track=${track}`],
  androidDir
);

console.log('> Yukleme tamamlandi.');
