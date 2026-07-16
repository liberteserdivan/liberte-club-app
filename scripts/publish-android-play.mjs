#!/usr/bin/env node
/**
 * Play Console'a imzali AAB yukler (Gradle Play Publisher).
 * Kullanim:
 *   node scripts/publish-android-play.mjs [track] [--build]
 * Ornek:
 *   node scripts/publish-android-play.mjs internal --build
 *   node scripts/publish-android-play.mjs alpha --from-codemagic <buildId>
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const androidDir = path.join(root, 'android');
const credFile = path.join(androidDir, 'play-console-service-account.json');
const validTracks = new Set(['internal', 'alpha', 'beta', 'production']);

function loadEnv() {
  for (const name of ['.env', '.env.local']) {
    const envPath = path.join(root, name);
    if (!existsSync(envPath)) continue;
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key] && value) process.env[key] = value;
    }
  }
}

async function downloadCodemagicAab(buildId) {
  loadEnv();
  const token = process.env.CODEMAGIC_API_TOKEN || process.env.CM_API_TOKEN;
  if (!token) {
    console.error('CODEMAGIC_API_TOKEN eksik');
    process.exit(1);
  }
  const response = await fetch(`https://api.codemagic.io/builds/${buildId}`, {
    headers: { 'x-auth-token': token }
  });
  const payload = await response.json();
  const build = payload.build || payload;
  const aab = (build.artefacts || build.artifacts || []).find((item) => item.type === 'aab');
  if (!aab?.url) {
    console.error('AAB artifact bulunamadi');
    process.exit(1);
  }
  const artifact = await fetch(aab.url, { headers: { 'x-auth-token': token } });
  if (!artifact.ok) {
    console.error('AAB indirme basarisiz:', artifact.status);
    process.exit(1);
  }
  const outDir = path.join(androidDir, 'app', 'build', 'outputs', 'bundle', 'release');
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'app-release.aab');
  const buffer = Buffer.from(await artifact.arrayBuffer());
  writeFileSync(outPath, buffer);
  console.log(`> Codemagic AAB indirildi: ${outPath} (${buffer.length} byte)`);
}

const args = process.argv.slice(2);
const fromCodemagicIdx = args.indexOf('--from-codemagic');
const codemagicBuildId = fromCodemagicIdx >= 0 ? args[fromCodemagicIdx + 1] : null;
const filteredArgs = fromCodemagicIdx >= 0
  ? args.filter((_, idx) => idx !== fromCodemagicIdx && idx !== fromCodemagicIdx + 1)
  : args;
const shouldBuild = filteredArgs.includes('--build');
const trackArg = filteredArgs.find((a) => !a.startsWith('--'));
const track = trackArg || process.env.PLAY_TRACK || 'internal';

if (!validTracks.has(track)) {
  console.error(`Gecersiz kanal: ${track}. Secenekler: ${[...validTracks].join(', ')}`);
  process.exit(1);
}

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

if (codemagicBuildId) {
  await downloadCodemagicAab(codemagicBuildId);
  console.error('Codemagic AAB indirildi. Play yuklemesi icin ENABLE_PLAY_UPLOAD=true ile yeni build tetikleyin');
  console.error('  node scripts/trigger-codemagic.mjs android-release main');
  process.exit(0);
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
