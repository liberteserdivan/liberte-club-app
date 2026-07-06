import { SELECTORS } from './selectors.js';
import { getMobileTestCredentials } from './credentials.js';
import { createApiDiagnostic, logSafe } from './diagnostics.js';
import { switchToAppWebView, waitForTestId, isDisplayed } from './webview.js';

const ADMIN_MEMBERS_TIMEOUT_MS = 45_000;
const LOGIN_TIMEOUT_MS = 90_000;

/** Splash sonrasÃ„Â± login veya ana ekran */
export async function assertAppLaunch(browser, meta) {
  await switchToAppWebView(browser);
  const loginVisible = await isDisplayed(browser, SELECTORS.loginPhone, 75_000);
  const homeVisible = await isDisplayed(browser, SELECTORS.navHome, 15_000);
  if (!loginVisible && !homeVisible) {
    throw new Error('AÃ«Â¿Â¯Ã‚Â½Ã„Â±lÃ„Â±Ã…Å¸ sonrasÃ„Â± login veya home gÃ«Â¿Â¯Ã‚Â½rÃ«Â¿Â¯Ã‚Â½nmedi');
  }
  logSafe('app-launch', { ...meta, step: 'launch', status: 'ok' });
}

/** Telefon + PIN ile giriÃ…Å¸ */
export async function loginWithPin(browser, meta) {
  const { phone, pin } = getMobileTestCredentials();
  await switchToAppWebView(browser);

  if (!(await isDisplayed(browser, SELECTORS.loginPhone, 5_000))) {
    return;
  }

  const phoneInput = await waitForTestId(browser, SELECTORS.loginPhone, LOGIN_TIMEOUT_MS);
  await phoneInput.clearValue();
  await phoneInput.setValue(phone);

  const pinInput = await waitForTestId(browser, SELECTORS.loginPin, LOGIN_TIMEOUT_MS);
  await pinInput.clearValue();
  await pinInput.setValue(pin);

  const submit = await browser.$(SELECTORS.loginSubmit);
  await submit.click();

  await waitForTestId(browser, SELECTORS.navHome, LOGIN_TIMEOUT_MS);
  await dismissAdminPinGateIfVisible(browser);

  const errorVisible = await isDisplayed(browser, '.loginError, .adminPinError', 2_000);
  if (errorVisible) {
    throw new Error('Login sonrasÃ„Â± hata mesajÃ„Â± gÃ«Â¿Â¯Ã‚Â½rÃ«Â¿Â¯Ã‚Â½ndÃ«Â¿Â¯Ã‚Â½');
  }

  logSafe('login', { ...meta, step: 'login', status: 'ok' });
}


/** Admin PIN tam ekran kapisini kapatir — profil navigasyonu icin */
async function dismissAdminPinGateIfVisible(browser) {
  if (!(await isDisplayed(browser, SELECTORS.adminPinInput, 3_000))) {
    return;
  }
  if (await isDisplayed(browser, SELECTORS.adminPinSkip, 2_000)) {
    await browser.$(SELECTORS.adminPinSkip).click();
    return;
  }
  const { adminPin } = getMobileTestCredentials();
  if (!adminPin) return;
  const pinInput = await waitForTestId(browser, SELECTORS.adminPinInput);
  await pinInput.setValue(adminPin);
  await browser.$(SELECTORS.adminPinSubmit).click();
}

/** Profilden Ã«Â¿Â¯Ã‚Â½Ã„Â±kÃ„Â±Ã…Å¸ */
export async function logoutFromProfile(browser, meta) {
  await switchToAppWebView(browser);
  await dismissAdminPinGateIfVisible(browser);
  const profileNav = await waitForTestId(browser, SELECTORS.navProfile);
  await profileNav.click();
  const logoutBtn = await waitForTestId(browser, SELECTORS.logoutButton);
  await logoutBtn.click();
  await waitForTestId(browser, SELECTORS.loginPhone, LOGIN_TIMEOUT_MS);
  logSafe('logout', { ...meta, step: 'logout', status: 'ok' });
}

/** UygulamayÃ„Â± yeniden baÃ…Å¸lat Ã¢â‚¬â€ oturum korunmalÃ„Â± */
export async function relaunchAndAssertSession(browser, meta) {
  const appPackage = browser.capabilities['appium:appPackage'] || browser.capabilities.appPackage;
  const appActivity = browser.capabilities['appium:appActivity'] || browser.capabilities.appActivity;
  if (appPackage && appActivity) {
    await browser.pressKeyCode(3);
    await browser.pause(1_500);
    await browser.execute('mobile: activateApp', { appId: appPackage });
  } else {
    await browser.reloadSession();
  }
  await switchToAppWebView(browser);
  const stillLoggedIn = await isDisplayed(browser, SELECTORS.navHome, 30_000);
  const loginAgain = await isDisplayed(browser, SELECTORS.loginPhone, 3_000);
  if (!stillLoggedIn || loginAgain) {
    throw new Error('Relaunch sonrasÃ„Â± oturum korunmadÃ„Â±');
  }
  logSafe('session-restore', { ...meta, step: 'session-restore', status: 'ok' });
}

/** Admin PIN ve Ã«Â¿Â¯Ã‚Â½ye listesi */
export async function verifyAdminMembers(browser, meta) {
  await dismissAdminPinGateIfVisible(browser);
  const { adminPin } = getMobileTestCredentials();
  if (!adminPin) {
    logSafe('admin-skip', { ...meta, step: 'admin-pin', status: 'skipped', code: 'NO_ADMIN_PIN' });
    return;
  }

  await switchToAppWebView(browser);
  const profileNav = await browser.$(SELECTORS.navProfile);
  if (await profileNav.isDisplayed()) {
    await profileNav.click();
  }

  const adminBtn = await browser.$(SELECTORS.openAdminPanel);
  if (!(await adminBtn.isDisplayed())) {
    logSafe('admin-skip', { ...meta, step: 'admin-panel', status: 'skipped', code: 'NOT_ADMIN_USER' });
    return;
  }
  await adminBtn.click();

  if (await isDisplayed(browser, SELECTORS.adminPinInput, 8_000)) {
    const pinInput = await waitForTestId(browser, SELECTORS.adminPinInput);
    await pinInput.setValue(adminPin);
    const submit = await browser.$(SELECTORS.adminPinSubmit);
    await submit.click();
  }

  await waitForTestId(browser, SELECTORS.adminMembersPanel, 20_000);

  const started = Date.now();
  let statusText = '';
  while (Date.now() - started < ADMIN_MEMBERS_TIMEOUT_MS) {
    const statusEl = await browser.$(SELECTORS.adminMembersStatus);
    if (await statusEl.isDisplayed()) {
      statusText = await statusEl.getText();
      if (/Ã«Â¿Â¯Ã‚Â½ye listeleniyor/i.test(statusText)) {
        break;
      }
      if (/yÃ«Â¿Â¯Ã‚Â½klenemedi|hata|503|500|timeout/i.test(statusText)) {
        const diag = createApiDiagnostic({
          ...meta,
          path: '/api/admin/members',
          status: 500,
          code: 'ADMIN_MEMBERS_UI_ERROR',
          step: 'admin-members',
          durationMs: Date.now() - started
        });
        logSafe('admin-members-fail', diag);
        throw new Error('Admin Ã«Â¿Â¯Ã‚Â½ye listesi hata durumunda');
      }
    }
    await browser.pause(1_000);
  }

  if (!/Ã«Â¿Â¯Ã‚Â½ye listeleniyor/i.test(statusText)) {
    const diag = createApiDiagnostic({
      ...meta,
      path: '/api/admin/members',
      status: 504,
      code: 'ADMIN_MEMBERS_TIMEOUT',
      step: 'admin-members',
      durationMs: Date.now() - started
    });
    logSafe('admin-members-timeout', diag);
    throw new Error('Admin Ã«Â¿Â¯Ã‚Â½ye listesi zaman aÃ…Å¸Ã„Â±mÃ„Â±');
  }

  logSafe('admin-members', createApiDiagnostic({
    ...meta,
    path: '/api/admin/members',
    status: 200,
    step: 'admin-members',
    durationMs: Date.now() - started
  }));
}

/** Login/logout dÃ«Â¿Â¯Ã‚Â½ngÃ«Â¿Â¯Ã‚Â½sÃ«Â¿Â¯Ã‚Â½ */
export async function repeatLoginLogout(browser, meta, cycles = 3) {
  for (let i = 0; i < cycles; i += 1) {
    await loginWithPin(browser, { ...meta, step: `login-cycle-${i + 1}` });
    await logoutFromProfile(browser, { ...meta, step: `logout-cycle-${i + 1}` });
  }
  logSafe('stability-cycles', { ...meta, step: 'stability', status: 'ok', code: String(cycles) });
}
