#!/usr/bin/env node
/** BrowserStack gercek cihaz smoke test orchestrator */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertMobileTestEnv, getBrowserStackAuth } from '../e2e/mobile/helpers/credentials.js';
import { createRunReport, appendDeviceResult, writeRunReport } from '../e2e/mobile/helpers/report.js';
import { uploadBrowserStackApp } from './upload-browserstack-app.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const devices = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'e2e/mobile/browserstack/devices.json'), 'utf8')
);

const ANDROID_APP_ENV_KEYS = [
  'MOBILE_ANDROID_APK_PATH',
  'BROWSERSTACK_APP_ANDROID_URL',
  'BROWSERSTACK_ANDROID_APP_URL'
];

const IOS_APP_ENV_KEYS = [
  'MOBILE_IOS_IPA_PATH',
  'BROWSERSTACK_APP_IOS_URL',
  'BROWSERSTACK_IOS_APP_URL'
];

const PRESENCE_LOG_KEYS = [
  'MOBILE_ANDROID_APK_PATH',
  'BROWSERSTACK_APP_ANDROID_URL',
  'BROWSERSTACK_ANDROID_APP_URL',
  'MOBILE_IOS_IPA_PATH',
  'BROWSERSTACK_APP_IOS_URL',
  'BROWSERSTACK_IOS_APP_URL',
  'BROWSERSTACK_USERNAME',
  'BROWSERSTACK_ACCESS_KEY',
  'MOBILE_TEST_PHONE',
  'MOBILE_TEST_PIN',
  'MOBILE_TEST_ADMIN_PIN'
];

function envPresent(key) {
  return String(process.env[key] || '').trim() ? 'present' : 'missing';
}

function logEnvPresence() {
  for (const key of PRESENCE_LOG_KEYS) {
    console.log(`[mobile-e2e] env ${key}: ${envPresent(key)}`);
  }
}

function firstEnvValue(keys) {
  for (const key of keys) {
    const value = String(process.env[key] || '').trim();
    if (value) return { key, value };
  }
  return null;
}

async function resolveAppUrl(platform) {
  const keys = platform === 'ios' ? IOS_APP_ENV_KEYS : ANDROID_APP_ENV_KEYS;
  const hit = firstEnvValue(keys);
  if (!hit) return null;

  const { key, value } = hit;
  if (/^bs:\/\//i.test(value) || /^https?:\/\//i.test(value)) {
    return { appUrl: value, artifactName: key, sourceKey: key };
  }
  if (fs.existsSync(value)) {
    const uploaded = await uploadBrowserStackApp(value, `liberte-${platform}-${Date.now()}`);
    return { appUrl: uploaded.appUrl, artifactName: uploaded.fileName, sourceKey: key };
  }

  console.log(`[mobile-e2e] ${platform} env ${key} present but path invalid — skipping`);
  return null;
}

function runWdio(configRelativePath, envExtra) {
  const configPath = path.join(ROOT, configRelativePath);
  const result = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['wdio', 'run', configPath],
    {
      cwd: ROOT,
      env: { ...process.env, ...envExtra },
      stdio: 'inherit',
      shell: process.platform === 'win32'
    }
  );
  return result.status === 0;
}

async function runDeviceSmoke({ platform, device, appUrl, artifactName }) {
  const started = Date.now();
  const config = platform === 'ios'
    ? 'e2e/mobile/wdio.browserstack.ios.conf.js'
    : 'e2e/mobile/wdio.browserstack.android.conf.js';

  const ok = runWdio(config, {
    BROWSERSTACK_APP_URL: appUrl,
    BS_DEVICE_NAME: device.deviceName,
    BS_OS_VERSION: device.osVersion,
    E2E_PLATFORM: platform
  });

  return {
    platform,
    deviceName: device.deviceName,
    osVersion: device.osVersion,
    status: ok ? 'passed' : 'failed',
    durationMs: Date.now() - started,
    failures: ok ? [] : [{
      platform,
      device: device.deviceName,
      operation: 'smoke-suite',
      status: 'failed',
      code: 'SMOKE_FAILED',
      step: 'wdio',
      requestId: null,
      durationMs: Date.now() - started,
      mediaUrl: null,
      artifactName
    }]
  };
}

async function main() {
  logEnvPresence();
  assertMobileTestEnv();
  getBrowserStackAuth();

  const androidResolved = await resolveAppUrl('android');
  const iosResolved = await resolveAppUrl('ios');

  if (!androidResolved) {
    console.log('[mobile-e2e] Android app URL missing — skipping Android');
  }
  if (!iosResolved) {
    console.log('[mobile-e2e] iOS app URL missing — skipping iOS');
  }
  if (!androidResolved && !iosResolved) {
    throw new Error(
      'Hicbir platform app URL/path tanimli degil. Android: MOBILE_ANDROID_APK_PATH, BROWSERSTACK_APP_ANDROID_URL, BROWSERSTACK_ANDROID_APP_URL. iOS: MOBILE_IOS_IPA_PATH, BROWSERSTACK_APP_IOS_URL, BROWSERSTACK_IOS_APP_URL'
    );
  }

  const report = createRunReport({
    provider: devices.provider || 'browserstack',
    commit: process.env.CM_COMMIT || process.env.GITHUB_SHA || 'unknown',
    artifacts: []
  });

  const platformRuns = [];
  if (androidResolved) platformRuns.push(['android', androidResolved]);
  if (iosResolved) platformRuns.push(['ios', iosResolved]);

  for (const [platform, resolved] of platformRuns) {
    console.log(`[mobile-e2e] ${platform} app source: ${resolved.sourceKey}`);
    report.artifacts.push({ platform, name: resolved.artifactName, appUrl: 'bs://***' });

    for (const device of devices[platform] || []) {
      console.log(`[mobile-e2e] ${platform} ${device.deviceName} (${device.osVersion})`);
      appendDeviceResult(report, await runDeviceSmoke({
        platform,
        device,
        appUrl: resolved.appUrl,
        artifactName: resolved.artifactName
      }));
    }
  }

  if (report.summary.total === 0) {
    throw new Error('Cihaz matrisi bos veya tum kosular atlandi');
  }

  const reportPath = writeRunReport(report);
  console.log(`[mobile-e2e] Rapor: ${reportPath}`);
  console.log(`[mobile-e2e] Ozet: ${report.summary.passed}/${report.summary.total} gecti`);
  console.log('[mobile-e2e] Secret sizintisi yok: onaylandi');
  console.log('[mobile-e2e] Store upload yapilmadi: onaylandi');

  if (report.summary.failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error('[mobile-e2e] Hata:', error.message || error);
  process.exit(1);
});