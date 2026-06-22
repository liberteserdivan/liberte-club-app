import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// iOS yalnızca iPhone hedeflemeli — App Store iPad screenshot zorunluluğunu kaldırır
test('Xcode TARGETED_DEVICE_FAMILY yalnızca iPhone', () => {
  const pbx = readFileSync(join(root, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj'), 'utf8');
  assert.match(pbx, /TARGETED_DEVICE_FAMILY = 1;/);
  assert.doesNotMatch(pbx, /TARGETED_DEVICE_FAMILY = "1,2"/);
  assert.doesNotMatch(pbx, /TARGETED_DEVICE_FAMILY = 1,2/);
});

test('Info.plist iPad yönelim anahtarı yok', () => {
  const plist = readFileSync(join(root, 'ios', 'App', 'App', 'Info.plist'), 'utf8');
  assert.doesNotMatch(plist, /UISupportedInterfaceOrientations~ipad/);
  assert.match(plist, /UIDeviceFamily/);
  assert.match(plist, /UIRequiresFullScreen/);
});

test('Production index göreli asset yolları kullanır', () => {
  const html = readFileSync(join(root, 'dist', 'index.html'), 'utf8');
  assert.match(html, /src="\.\/assets\//);
  assert.match(html, /href="\.\/assets\//);
  assert.match(html, /liberte-club-splash-master\.png/);
});

test('Vite base göreli — Capacitor WebView uyumlu', () => {
  const vite = readFileSync(join(root, 'vite.config.js'), 'utf8');
  assert.match(vite, /base:\s*['"]\.\/['"]/);
});

test('Podfile native eklentileri CocoaPods ile baglar', () => {
  const podfile = readFileSync(join(root, 'ios', 'App', 'Podfile'), 'utf8');
  assert.match(podfile, /CapacitorFirebaseMessaging/);
  assert.match(podfile, /CapacitorMlkitBarcodeScanning/);
  assert.doesNotMatch(podfile, /CapacitorPushNotifications/);
});

test('Release imzasi Manual ve push entitlement baglantisi', () => {
  const pbx = readFileSync(join(root, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj'), 'utf8');
  assert.match(pbx, /CODE_SIGN_STYLE = Manual;/);
  assert.match(pbx, /CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/);
  assert.doesNotMatch(pbx, /PROVISIONING_PROFILE_SPECIFIER = "";/);
});
