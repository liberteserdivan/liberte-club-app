import { config as shared } from './wdio.shared.conf.js';

const deviceName = process.env.BS_DEVICE_NAME || 'Samsung Galaxy S24';
const osVersion = process.env.BS_OS_VERSION || '14.0';

export const config = {
  ...shared,
  user: process.env.BROWSERSTACK_USERNAME,
  key: process.env.BROWSERSTACK_ACCESS_KEY,
  hostname: 'hub.browserstack.com',
  port: 443,
  path: '/wd/hub',
  specs: ['./specs/smoke.spec.js'],
  capabilities: [{
    platformName: 'Android',
    'appium:app': process.env.BROWSERSTACK_APP_URL,
    'appium:autoGrantPermissions': true,
    'bstack:options': {
      deviceName,
      osVersion,
      projectName: 'Liberte Club',
      buildName: process.env.CM_COMMIT || process.env.GITHUB_SHA || 'local',
      sessionName: `android-smoke-${deviceName}`,
      networkLogs: true,
      interactiveDebugging: true,
      webviewDebugging: true
    }
  }],
  before: async () => {
    process.env.E2E_PLATFORM = 'android';
    process.env.BS_DEVICE_NAME = deviceName;
    process.env.BS_OS_VERSION = osVersion;
  }
};
