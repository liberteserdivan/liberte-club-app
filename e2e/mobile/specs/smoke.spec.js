import {
  assertAppLaunch,
  loginWithPin,
  relaunchAndAssertSession,
  verifyAdminMembers,
  repeatSessionRestore
} from '../helpers/flows.js';

function sessionMeta() {
  return {
    platform: process.env.E2E_PLATFORM || 'unknown',
    deviceName: process.env.BS_DEVICE_NAME || 'unknown',
    osVersion: process.env.BS_OS_VERSION || 'unknown'
  };
}

describe('Liberte Club mobil smoke', () => {
  it('1 — uygulama acilisi (splash sonrasi login veya home)', async () => {
    await assertAppLaunch(browser, sessionMeta());
  });

  it('2 — telefon/PIN ile login', async () => {
    await loginWithPin(browser, sessionMeta());
  });

  it('3 — oturum korunumu (relaunch)', async () => {
    await relaunchAndAssertSession(browser, sessionMeta());
  });

  it('4 — oturum restore (ikinci relaunch)', async () => {
    await relaunchAndAssertSession(browser, sessionMeta());
  });

  it('5 — admin PIN ve admin panel', async () => {
    await verifyAdminMembers(browser, sessionMeta());
  });

  it('6 — admin members listesi', async () => {
    await verifyAdminMembers(browser, { ...sessionMeta(), step: 'admin-members-recheck' });
  });

  it('7 — oturum restore stabilite (3 dongu)', async () => {
    await repeatSessionRestore(browser, sessionMeta(), 3);
  });
});