import { config as shared } from './wdio.shared.conf.js';

const deviceName = process.env.BS_DEVICE_NAME || 'iPhone 15';
const osVersion = process.env.BS_OS_VERSION || '17';
const p0Only = String(process.env.MOBILE_SMOKE_P0_ONLY || '').trim() === 'true';
const smokeSpec = p0Only ? './specs/smoke-p0.spec.js' : './specs/smoke.spec.js';

export const config = {
  ...shared,
  user: process.env.BROWSERSTACK_USERNAME,
  key: process.env.BROWSERSTACK_ACCESS_KEY,
  hostname: 'hub.browserstack.com',
  port: 443,
  path: '/wd/hub',
  specs: [smokeSpec],
  capabilities: [{
    platformName: 'iOS',
    'appium:app': process.env.BROWSERSTACK_APP_URL,
    'appium:autoAcceptAlerts': true,
    'bstack:options': {
      deviceName,
      osVersion,
      projectName: 'Liberte Club',
      buildName: process.env.CM_COMMIT || process.env.GITHUB_SHA || 'local',
      sessionName: p0Only ? `ios-smoke-p0-${deviceName}` : `ios-smoke-${deviceName}`,
      networkLogs: true,
      interactiveDebugging: true
    }
  }],
  before: async () => {
    process.env.E2E_PLATFORM = 'ios';
    process.env.BS_DEVICE_NAME = deviceName;
    process.env.BS_OS_VERSION = osVersion;
  }
};