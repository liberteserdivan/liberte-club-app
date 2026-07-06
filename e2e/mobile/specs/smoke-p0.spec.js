import { assertAppLaunch, loginWithPin, logoutFromProfile } from '../helpers/flows.js';

function sessionMeta() {
  return {
    platform: process.env.E2E_PLATFORM || 'unknown',
    deviceName: process.env.BS_DEVICE_NAME || 'unknown',
    osVersion: process.env.BS_OS_VERSION || 'unknown'
  };
}

// P0: launch + login + logout/relogin — tam suite oncesi CI kapisi
describe('Liberte Club mobil smoke P0', () => {
  it('1 — uygulama acilisi (splash sonrasi login veya home)', async () => {
    await assertAppLaunch(browser, sessionMeta());
  });

  it('2 — telefon/PIN ile login', async () => {
    await loginWithPin(browser, sessionMeta());
  });

  it('3 — logout ve tekrar login', async () => {
    await logoutFromProfile(browser, sessionMeta());
    await loginWithPin(browser, sessionMeta());
  });
});