#!/usr/bin/env node
/** Android emulatorde P0 smoke — BrowserStack olmadan */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertMobileTestEnv } from '../e2e/mobile/helpers/credentials.js';
import { createRunReport, appendDeviceResult, writeRunReport } from '../e2e/mobile/helpers/report.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_APK = path.join(ROOT, 'android/app/build/outputs/apk/debug/app-debug.apk');

function resolveApkPath() {
  const fromEnv = String(process.env.MOBILE_ANDROID_APK_PATH || '').trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  if (fs.existsSync(DEFAULT_APK)) return DEFAULT_APK;
  return null;
}

function runWdio() {
  const configPath = path.join(ROOT, 'e2e/mobile/wdio.local.android.conf.js');
  const logDir = path.join(ROOT, 'e2e/mobile/reports');
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, `wdio-emulator-${Date.now()}.log`);

  const result = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['wdio', 'run', configPath],
    {
      cwd: path.join(ROOT, 'e2e/mobile'),
      env: process.env,
      encoding: 'utf8',
      shell: process.platform === 'win32'
    }
  );

  const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  if (output) fs.writeFileSync(logFile, output.slice(-12000), 'utf8');
  if (result.status !== 0) {
    console.error(`[mobile-emulator] wdio failed log=${path.basename(logFile)}`);
    if (output) console.error(output.slice(-2000));
  }
  return result.status === 0;
}

function main() {
  process.env.MOBILE_SMOKE_PROVIDER = 'emulator';
  if (!process.env.MOBILE_SMOKE_P0_ONLY) {
    process.env.MOBILE_SMOKE_P0_ONLY = 'true';
  }

  const apkPath = resolveApkPath();
  if (!apkPath) {
    console.error(`[mobile-emulator] APK bulunamadi: ${DEFAULT_APK}`);
    process.exit(1);
  }
  process.env.MOBILE_ANDROID_APK_PATH = apkPath;

  assertMobileTestEnv();

  const started = Date.now();
  const report = createRunReport({
    provider: 'android-emulator',
    commit: process.env.GITHUB_SHA || process.env.CM_COMMIT || null,
    artifacts: [{ platform: 'android', name: path.basename(apkPath) }]
  });

  const ok = runWdio();
  appendDeviceResult(report, {
    platform: 'android',
    deviceName: process.env.EMULATOR_DEVICE_NAME || 'Android Emulator',
    osVersion: process.env.ANDROID_PLATFORM_VERSION || '14',
    status: ok ? 'passed' : 'failed',
    durationMs: Date.now() - started,
    failures: ok ? [] : [{
      platform: 'android',
      device: 'emulator',
      operation: 'smoke-p0',
      status: 'failed',
      code: 'SMOKE_FAILED',
      step: 'wdio',
      durationMs: Date.now() - started
    }]
  });

  const reportPath = writeRunReport(report);
  console.log(`[mobile-emulator] Rapor: ${reportPath}`);
  console.log(`[mobile-emulator] Ozet: ${report.summary.passed}/${report.summary.total} gecti`);
  if (!ok) process.exit(1);
}

main();