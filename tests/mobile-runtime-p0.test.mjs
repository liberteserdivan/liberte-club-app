import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (p) => readFileSync(join(root, p), 'utf8');

test('apiClient: 401 onUnauthorized authEpoch ile korunur', () => {
  const src = read('src/lib/apiClient.js');
  assert.match(src, /getAuthEpoch\(\) === epochAtStart/);
  assert.match(src, /const epochAtStart = getAuthEpoch\(\)/);
});

test('AUTH_REQUEST_OPTIONS: tum native platformlarda 40sn', () => {
  const src = read('src/lib/apiClient.js');
  assert.match(src, /timeoutMs: isNativeApp\(\) \? NATIVE_AUTH_FETCH_TIMEOUT_MS/);
  assert.doesNotMatch(src, /isNativeApp\(\) && isIos\(\) \? NATIVE_AUTH_FETCH_TIMEOUT_MS/);
});

test('apiClient: native fetch CapacitorHttp icin AbortController kullanmaz', () => {
  const src = read('src/lib/apiClient.js');
  assert.match(src, /if \(isNativeApp\(\)\) \{[\s\S]*nativeFetchWithTimeout/);
  assert.doesNotMatch(src, /isNativeApp\(\) && isAndroid\(\)/);
});

test('apiClient: login omitAuth bayat Bearer gondermez', () => {
  const src = read('src/lib/apiClient.js');
  assert.match(src, /omitAuth/);
  const login = read('src/pages/LoginPage.jsx');
  assert.match(login, /omitAuth:\s*true/);
  assert.match(login, /waitForPendingLogout/);
});

test('session: cikis sonrasi pending logout beklenebilir', () => {
  const src = read('src/lib/session.js');
  assert.match(src, /pendingLogoutPromise/);
  assert.match(src, /waitForPendingLogout/);
  assert.match(src, /resetSupabaseClient/);
});

test('destroySession: hizli runSqlSessionDelete kullanir', () => {
  const auth = read('api/_lib/auth.js');
  const runSql = read('api/_lib/runSql.js');
  assert.match(runSql, /runSqlSessionDelete/);
  assert.match(auth, /runSqlSessionDelete/);
});

test('session/logout: tum token depolari temizlenir', () => {
  const src = read('src/lib/session.js');
  assert.match(src, /clearNativeAuthToken\(\)/);
  assert.match(src, /memorySession = null/);
  assert.match(src, /bumpAuthEpoch/);
});

test('apiClient clearNativeAuthToken legacy anahtarlari temizler', () => {
  const src = read('src/lib/apiClient.js');
  assert.match(src, /LEGACY_TOKEN_KEYS/);
  assert.match(src, /sessionStorage\.removeItem/);
  assert.match(src, /localStorage\.removeItem/);
});

test('LoginPage: cift submit ve attempt guard', () => {
  const src = read('src/pages/LoginPage.jsx');
  assert.match(src, /loginInFlightRef/);
  assert.match(src, /loginAttemptRef/);
  assert.match(src, /attemptId !== loginAttemptRef\.current/);
});

test('adminMemberClient: native uzun timeout ve diagnostic', () => {
  const src = read('src/lib/adminMemberClient.js');
  assert.match(src, /ADMIN_MEMBERS_REQUEST_OPTIONS/);
  assert.match(src, /error\.requestId/);
  assert.match(src, /skipUnauthorized: true/);
});

test('adminMembers handler: safe timings ve step', () => {
  const src = read('api/_lib/handlers/adminMembers.js');
  assert.match(src, /auth_ms/);
  assert.match(src, /members_query_ms/);
  assert.match(src, /step: 'admin_members_transient'/);
  assert.match(src, /requireAdminSession/);
});

test('auth readAuthToken Bearer destekler', () => {
  const src = read('api/_lib/auth.js');
  assert.match(src, /Bearer /);
});

test('mobil e2e: klasor yapisi mevcut', () => {
  const required = [
    'e2e/mobile/specs/smoke.spec.js',
    'e2e/mobile/specs/smoke-p0.spec.js',
    'e2e/mobile/helpers/flows.js',
    'e2e/mobile/helpers/credentials.js',
    'e2e/mobile/wdio.browserstack.android.conf.js',
    'e2e/mobile/browserstack/devices.json',
    'scripts/run-browserstack-mobile-tests.mjs'
  ];
  for (const rel of required) {
    assert.ok(readFileSync(join(root, rel)), `${rel} ok`);
  }
});

test('mobil e2e: codemagic workflowlari tanimli', () => {
  const yaml = read('codemagic.yaml');
  assert.match(yaml, /android-test-artifact:/);
  assert.match(yaml, /ios-test-artifact:/);
  assert.match(yaml, /android-mobile-smoke:/);
  assert.match(yaml, /mobile-device-tests:/);
  assert.match(yaml, /liberte_android/);
  assert.match(yaml, /BROWSERSTACK_APP_ANDROID_URL/);
  assert.match(yaml, /BROWSERSTACK_ANDROID_APP_URL/);
  assert.match(yaml, /MOBILE_ANDROID_APK_PATH/);
  assert.match(yaml, /MOBILE_SMOKE_QUICK/);
  assert.match(yaml, /MOBILE_SMOKE_P0_ONLY/);
  assert.match(yaml, /ENABLE_PLAY_UPLOAD/);
  assert.doesNotMatch(yaml, /\bnvm\b/);
});

test('mobil e2e: wdio P0 spec secimi', () => {
  const android = read('e2e/mobile/wdio.browserstack.android.conf.js');
  assert.match(android, /MOBILE_SMOKE_P0_ONLY/);
  assert.match(android, /smoke-p0\.spec\.js/);
});

test('mobil e2e: smoke build webview debug bayragi', () => {
  const yaml = read('codemagic.yaml');
  const gradle = read('android/app/build.gradle');
  const main = read('android/app/src/main/java/cafe/liberte/app/MainActivity.java');
  assert.match(yaml, /assembleDebug/);
  assert.match(yaml, /apk\/debug\/app-debug\.apk/);
  assert.match(main, /BuildConfig\.DEBUG/);
});

test('mobil e2e: post-login blocker helper', () => {
  const flows = read('e2e/mobile/helpers/flows.js');
  assert.match(flows, /dismissPostLoginBlockers/);
  assert.match(flows, /dismissOnboardingIfVisible/);
  assert.match(flows, /startActivity/);
  assert.match(read('e2e/mobile/helpers/selectors.js'), /onboardingSkip/);
});

test('mobil e2e: app url alias cozumleme', () => {
  const src = read('scripts/run-browserstack-mobile-tests.mjs');
  assert.match(src, /BROWSERSTACK_ANDROID_APP_URL/);
  assert.match(src, /BROWSERSTACK_IOS_APP_URL/);
  assert.match(src, /logEnvPresence/);
  assert.match(src, /skipping Android/);
  assert.match(src, /skipping iOS/);
});

test('mobil e2e: UI testid secicileri', () => {
  assert.match(read('src/pages/LoginPage.jsx'), /data-testid="login-pin"/);
  assert.match(read('src/pages/LoginPage.jsx'), /data-testid="login-auto-restore"/);
  assert.doesNotMatch(read('src/pages/ProfilePage.jsx'), /data-testid="logout-button"/);
  assert.match(read('src/components/OnboardingOverlay.jsx'), /data-testid="onboarding-skip"/);
  assert.match(read('src/pages/AdminPage.jsx'), /data-testid="admin-members-panel"/);
});

test('mobil e2e: package scriptleri', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.scripts['test:e2e:mobile']);
  assert.ok(pkg.scripts['test:e2e:mobile:emulator']);
  assert.ok(pkg.devDependencies['@wdio/cli']);
});

test('mobil e2e: GitHub emulator workflow', () => {
  const wf = read('.github/workflows/android-mobile-smoke-emulator.yml');
  assert.match(wf, /android-emulator-runner/);
  assert.match(wf, /run-local-android-smoke/);
  assert.match(wf, /MOBILE_TEST_PHONE/);
  assert.match(read('e2e/mobile/wdio.local.android.conf.js'), /smoke-p0\.spec\.js/);
  assert.match(read('scripts/verify-local-mobile-test-env.mjs'), /MOBILE_TEST_PHONE/);
});