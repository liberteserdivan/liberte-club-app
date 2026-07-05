#!/usr/bin/env node
/**
 * BrowserStack gercek cihaz smoke test orchestrator.
 * Secret'lar yalnizca env'den okunur.
 */
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

/** wdio kosusunu calistirir */
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

/** Tek cihazda smoke kosusu */
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

/** Platform icin app URL cozer */
async function resolveAppUrl(platform) {
  const envKey = platform === 'ios' ? 'BROWSERSTACK_APP_IOS_URL' : 'BROWSERSTACK_APP_ANDROID_URL';
  const pathKey = platform === 'ios' ? 'MOBILE_IOS_IPA_PATH' : 'MOBILE_ANDROID_APK_PATH';
  if (process.env[envKey]) {
    return { appUrl: process.env[envKey], artifactName: process.env[envKey] };
  }
  const appPath = process.env[pathKey];
  if (appPath && fs.existsSync(appPath)) {
    const uploaded = await uploadBrowserStackApp(appPath, `liberte-${platform}-${Date.now()}`);
    return { appUrl: uploaded.appUrl, artifactName: uploaded.fileName };
  }
  return null;
}

async function main() {
  assertMobileTestEnv();
  getBrowserStackAuth();

  const report = createRunReport({
    provider: devices.provider || 'browserstack',
    commit: process.env.CM_COMMIT || process.env.GITHUB_SHA || 'unknown',
    artifacts: []
  });

  const platforms = String(process.env.MOBILE_E2E_PLATFORMS || 'android,ios')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  for (const platform of platforms) {
    const resolved = await resolveAppUrl(platform);
    if (!resolved) {
      console.log(`[mobile-e2e] ${platform} app yolu/URL yok — atlaniyor`);
      continue;
    }
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
    throw new Error('Hic cihaz kosusu yapilmadi — MOBILE_ANDROID_APK_PATH / MOBILE_IOS_IPA_PATH veya bs:// URL gerekli');
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
