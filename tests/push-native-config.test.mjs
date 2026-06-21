import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectPushTokenType,
  isApnsDeviceToken,
  isFcmRegistrationToken
} from '../src/lib/pushTokenFormat.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const sampleApns = 'a'.repeat(64);
const sampleFcm = `${'e'.repeat(120)}:APA91b${'x'.repeat(40)}`;

test('APNs token 64 hex olarak tanınır', () => {
  assert.equal(isApnsDeviceToken(sampleApns), true);
  assert.equal(isFcmRegistrationToken(sampleApns), false);
  assert.equal(detectPushTokenType(sampleApns), 'apns');
});

test('FCM token Firebase Admin ile uyumlu formatta tanınır', () => {
  assert.equal(isFcmRegistrationToken(sampleFcm), true);
  assert.equal(isApnsDeviceToken(sampleFcm), false);
  assert.equal(detectPushTokenType(sampleFcm), 'fcm');
});

test('Native push FirebaseMessaging kullanır — eski PushNotifications değil', () => {
  const nativePush = readFileSync(join(root, 'src', 'lib', 'nativePush.js'), 'utf8');
  assert.match(nativePush, /@capacitor-firebase\/messaging/);
  assert.match(nativePush, /FirebaseMessaging\.getToken/);
  assert.doesNotMatch(nativePush, /@capacitor\/push-notifications/);
  assert.doesNotMatch(nativePush, /PushNotifications\.register/);
});

test('package.json push-notifications yerine firebase messaging kullanır', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.ok(pkg.dependencies['@capacitor-firebase/messaging']);
  assert.equal(pkg.dependencies['@capacitor/push-notifications'], undefined);
});

test('App.entitlements aps-environment production', () => {
  const entitlements = readFileSync(
    join(root, 'ios', 'App', 'App', 'App.entitlements'),
    'utf8'
  );
  assert.match(entitlements, /<key>aps-environment<\/key>/);
  assert.match(entitlements, /<string>production<\/string>/);
});

test('Xcode CODE_SIGN_ENTITLEMENTS App.entitlements dosyasına bağlı', () => {
  const pbx = readFileSync(join(root, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj'), 'utf8');
  const matches = pbx.match(/CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/g) || [];
  assert.equal(matches.length, 2, 'Debug ve Release için entitlement bağlantısı gerekli');
});

test('GoogleService-Info.plist Xcode projesine bağlı', () => {
  const pbx = readFileSync(join(root, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj'), 'utf8');
  assert.match(pbx, /GoogleService-Info\.plist/);
});

test('Info.plist remote-notification arka plan modu', () => {
  const plist = readFileSync(join(root, 'ios', 'App', 'App', 'Info.plist'), 'utf8');
  assert.match(plist, /UIBackgroundModes/);
  assert.match(plist, /remote-notification/);
});

test('Xcode Push Notifications capability aktif', () => {
  const pbx = readFileSync(join(root, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj'), 'utf8');
  assert.match(pbx, /com\.apple\.Push/);
});

test('iOS minimum build number 33', () => {
  const pbx = readFileSync(join(root, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj'), 'utf8');
  assert.match(pbx, /CURRENT_PROJECT_VERSION = 42;/);
});

test('Codemagic build number alt siniri tanimli', () => {
  const yaml = readFileSync(join(root, 'codemagic.yaml'), 'utf8');
  assert.match(yaml, /IOS_MIN_BUILD_NUMBER/);
  assert.match(yaml, /materialize-firebase-native-config/);
});

test('Firebase native config materialize scripti mevcut', () => {
  assert.equal(existsSync(join(root, 'scripts', 'materialize-firebase-native-config.mjs')), true);
  assert.equal(existsSync(join(root, 'scripts', 'fix-ios-spm-paths.mjs')), true);
});

test('Android google-services.json gitignore ile korunur', () => {
  const gitignore = readFileSync(join(root, '.gitignore'), 'utf8');
  const androidIgnore = readFileSync(join(root, 'android', '.gitignore'), 'utf8');
  assert.match(gitignore, /google-services\.json/);
  assert.match(androidIgnore, /google-services\.json/);
});

test('GoogleService-Info.plist doğru Xcode klasöründe olabilir', () => {
  const correctPath = join(root, 'ios', 'App', 'App', 'GoogleService-Info.plist');
  const wrongPath = join(root, 'ios', 'App', 'GoogleService-Info.plist');
  assert.equal(existsSync(wrongPath), false, 'plist ios/App/ altında olmamalı');
  if (existsSync(correctPath)) {
    const plist = readFileSync(correctPath, 'utf8');
    assert.match(plist, /cafe\.liberte\.app/);
    assert.match(plist, /liberte-club/);
  }
});

test('Android google-services plugin koşullu uygulanır', () => {
  const gradle = readFileSync(join(root, 'android', 'app', 'build.gradle'), 'utf8');
  assert.match(gradle, /com\.google\.gms\.google-services/);
  assert.match(gradle, /google-services\.json not found/);
});

test('AndroidManifest POST_NOTIFICATIONS izni korunur', () => {
  const manifest = readFileSync(
    join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'),
    'utf8'
  );
  assert.match(manifest, /POST_NOTIFICATIONS/);
});

test('Android FCM bildirim kanalı MainActivity içinde tanımlı', () => {
  const main = readFileSync(
    join(root, 'android', 'app', 'src', 'main', 'java', 'cafe', 'liberte', 'app', 'MainActivity.java'),
    'utf8'
  );
  assert.match(main, /liberte_campaign/);
});

test('Android FCM bildirim ikonu ve manifest meta verisi tanımlı', () => {
  const iconPath = join(root, 'android', 'app', 'src', 'main', 'res', 'drawable', 'notification_icon.xml');
  assert.ok(existsSync(iconPath), 'notification_icon.xml eksik');

  const manifest = readFileSync(
    join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'),
    'utf8'
  );
  assert.match(manifest, /default_notification_icon/);
  assert.match(manifest, /default_notification_channel_id/);
});

test('Push gönderimi yalnızca admin handler üzerinden', () => {
  const admin = readFileSync(join(root, 'api', 'admin.js'), 'utf8');
  assert.match(admin, /push-send/);
  const handler = readFileSync(join(root, 'api', '_lib', 'handlers', 'adminPushSend.js'), 'utf8');
  assert.match(handler, /requireAdminSession/);
  assert.match(handler, /parseServiceAccount\(process\.env\.FIREBASE_SERVICE_ACCOUNT_JSON\)/);
});

test('Çıkışta cihaz token pasifleştirme fonksiyonu mevcut', () => {
  const prompt = readFileSync(join(root, 'src', 'lib', 'pushPrompt.js'), 'utf8');
  assert.match(prompt, /deactivateDevicePushToken/);
  assert.match(prompt, /active: false/);
});

test('keystore.properties gitignore ile korunur', () => {
  const gitignore = readFileSync(join(root, '.gitignore'), 'utf8');
  assert.match(gitignore, /android\/keystore\.properties/);
  assert.match(gitignore, /google-services\.json/);
  assert.match(gitignore, /GoogleService-Info\.plist/);
});
