import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// iOS push entitlement — App Store / TestFlight production
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

test('Info.plist remote-notification arka plan modu', () => {
  const plist = readFileSync(join(root, 'ios', 'App', 'App', 'Info.plist'), 'utf8');
  assert.match(plist, /UIBackgroundModes/);
  assert.match(plist, /remote-notification/);
});

test('Xcode Push Notifications capability aktif', () => {
  const pbx = readFileSync(join(root, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj'), 'utf8');
  assert.match(pbx, /com\.apple\.Push/);
});

test('Android google-services.json repoda yok — CI/CD yerel dosya gerekir', () => {
  const path = join(root, 'android', 'app', 'google-services.json');
  assert.equal(existsSync(path), false);
  assert.equal(existsSync(join(root, 'android', 'app', 'google-services.json.example')), true);
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
});
