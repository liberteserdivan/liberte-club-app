#!/usr/bin/env node
/**
 * iOS CocoaPods kurulumu — cap sync sonrasi ML Kit dahil pod bagimliliklari.
 * Codemagic ve lokal macOS build oncesi calistirilir.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const iosAppDir = join(rootDir, 'ios', 'App');
const podfilePath = join(iosAppDir, 'Podfile');
const spmDir = join(iosAppDir, 'CapApp-SPM');

function fail(message) {
  console.error(`[ios-pods] HATA: ${message}`);
  process.exit(1);
}

// SPM kalintisi varsa uyar — ML Kit baglanmaz
if (existsSync(spmDir)) {
  fail('CapApp-SPM klasoru hala mevcut. SPM + CocoaPods birlikte calismaz.');
}

if (!existsSync(podfilePath)) {
  fail('ios/App/Podfile bulunamadi.');
}

console.log('[ios-pods] cap sync ios...');
const capSync = spawnSync('npx', ['cap', 'sync', 'ios'], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: process.platform === 'win32'
});
if (capSync.status !== 0) {
  fail('npx cap sync ios basarisiz.');
}

const podfile = readFileSync(podfilePath, 'utf8');
const requiredPods = [
  'CapacitorMlkitBarcodeScanning',
  'CapacitorFirebaseMessaging'
];

for (const podName of requiredPods) {
  if (!podfile.includes(podName)) {
    fail(`Podfile icinde ${podName} yok — native QR veya push baglanmamis olabilir.`);
  }
}

console.log('[ios-pods] Podfile dogrulandi:', requiredPods.join(', '));

// macOS / Codemagic — pod install
const podCmd = process.platform === 'darwin' ? 'pod' : null;
if (!podCmd) {
  console.log('[ios-pods] Windows ortaminda pod install atlandi (Codemagic macOS uzerinde calisir).');
  process.exit(0);
}

const gemfilePath = join(rootDir, 'ios', 'Gemfile');
const useBundle = existsSync(gemfilePath);

if (useBundle) {
  console.log('[ios-pods] bundle install...');
  const bundleInstall = spawnSync('bundle', ['install'], {
    cwd: join(rootDir, 'ios'),
    stdio: 'inherit',
    shell: false
  });
  if (bundleInstall.status !== 0) {
    fail('bundle install basarisiz.');
  }
}

const installArgs = useBundle
  ? ['exec', 'pod', 'install', '--repo-update']
  : ['install', '--repo-update'];

const podInstall = spawnSync(useBundle ? 'bundle' : 'pod', installArgs, {
  cwd: iosAppDir,
  stdio: 'inherit',
  shell: false
});

if (podInstall.status !== 0) {
  fail('pod install basarisiz.');
}

const workspacePath = join(iosAppDir, 'App.xcworkspace');
if (!existsSync(workspacePath)) {
  fail('App.xcworkspace olusmadi — pod install tamamlanmamis.');
}

console.log('[ios-pods] CocoaPods kurulumu tamam.');
