import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as shared } from './wdio.shared.conf.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const p0Only = String(process.env.MOBILE_SMOKE_P0_ONLY || 'true').trim() === 'true';
const smokeSpec = p0Only ? './specs/smoke-p0.spec.js' : './specs/smoke.spec.js';
const apkPath = process.env.MOBILE_ANDROID_APK_PATH
  || path.join(root, 'android/app/build/outputs/apk/debug/app-debug.apk');

export const config = {
  ...shared,
  hostname: process.env.APPIUM_HOST || '127.0.0.1',
  port: Number(process.env.APPIUM_PORT || 4723),
  path: '/',
  waitforTimeout: 30_000,
  specs: [smokeSpec],
  capabilities: [{
    platformName: 'Android',
    'appium:deviceName': process.env.EMULATOR_DEVICE_NAME || 'Android Emulator',
    'appium:platformVersion': process.env.ANDROID_PLATFORM_VERSION || '14',
    'appium:app': apkPath,
    'appium:appPackage': 'cafe.liberte.app',
    'appium:appActivity': 'cafe.liberte.app.MainActivity',
    'appium:appWaitActivity': '*',
    'appium:appWaitDuration': 60_000,
    'appium:automationName': 'UiAutomator2',
    'appium:autoGrantPermissions': true,
    'appium:newCommandTimeout': 300,
    'appium:ignoreHiddenApiPolicyError': true,
    'appium:adbExecTimeout': 120_000
  }],
  before: async () => {
    process.env.E2E_PLATFORM = 'android';
  }
};