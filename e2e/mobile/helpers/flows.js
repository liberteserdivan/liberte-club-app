import { SELECTORS } from './selectors.js';
import { getMobileTestCredentials } from './credentials.js';
import { createApiDiagnostic, logSafe } from './diagnostics.js';
import { switchToAppWebView, waitForTestId, isDisplayed, safeClick } from './webview.js';

const ADMIN_MEMBERS_TIMEOUT_MS = 45_000;
const LOGIN_TIMEOUT_MS = 90_000;
const ADMIN_PANEL_TIMEOUT_MS = 45_000;

/** Splash sonrasi login veya ana ekran */
export async function assertAppLaunch(browser, meta) {
  await switchToAppWebView(browser);
  const loginVisible = await isDisplayed(browser, SELECTORS.loginPhone, 75_000);
  const homeVisible = await isDisplayed(browser, SELECTORS.navHome, 15_000);
  if (!loginVisible && !homeVisible) {
    throw new Error('Acilis sonrasi login veya home gorunmedi');
  }
  logSafe('app-launch', { ...meta, step: 'launch', status: 'ok' });
}

/** Ilk giris tanitim overlay'ini kapatir */
async function dismissOnboardingIfVisible(browser) {
  if (!(await isDisplayed(browser, SELECTORS.onboardingOverlay, 3_000))) {
    return;
  }
  if (await isDisplayed(browser, SELECTORS.onboardingSkip, 2_000)) {
    await safeClick(browser, SELECTORS.onboardingSkip);
    return;
  }
  if (await isDisplayed(browser, SELECTORS.onboardingNext, 2_000)) {
    await safeClick(browser, SELECTORS.onboardingNext);
  }
}

/** React input icin PIN degeri yazar */
async function setPinInputValue(browser, selector, value) {
  await browser.execute((css, pin) => {
    const input = document.querySelector(css);
    if (!input) return;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(input, pin);
    else input.value = pin;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, selector, value);
}

/** Login sonrasi engelleyici overlay'leri temizler */
async function dismissPostLoginBlockers(browser) {
  await dismissOnboardingIfVisible(browser);
}

/** Login submit sonrasi home gorunene kadar bekler */
async function waitForHomeAfterLogin(browser) {
  const deadline = Date.now() + LOGIN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isDisplayed(browser, SELECTORS.navHome, 2_000)) {
      return;
    }
    if (await isDisplayed(browser, '.loginError', 1_000)) {
      throw new Error('Login hata mesaji gorundu');
    }
    await dismissOnboardingIfVisible(browser);
    await browser.pause(800);
  }
  throw new Error('Login sonrasi home gorunmedi');
}

/** Telefon + PIN ile giris */
export async function loginWithPin(browser, meta) {
  const { phone, pin } = getMobileTestCredentials();
  await switchToAppWebView(browser);

  if (!(await isDisplayed(browser, SELECTORS.loginPhone, 5_000))) {
    return;
  }

  await waitForTestId(browser, SELECTORS.loginPhone, LOGIN_TIMEOUT_MS);
  await setPinInputValue(browser, SELECTORS.loginPhone, phone);
  await waitForTestId(browser, SELECTORS.loginPin, LOGIN_TIMEOUT_MS);
  await setPinInputValue(browser, SELECTORS.loginPin, pin);

  await safeClick(browser, SELECTORS.loginSubmit);
  await waitForHomeAfterLogin(browser);
  await dismissPostLoginBlockers(browser);

  const errorVisible = await isDisplayed(browser, '.loginError', 2_000);
  if (errorVisible) {
    throw new Error('Login sonrasi hata mesaji gorundu');
  }

  logSafe('login', { ...meta, step: 'login', status: 'ok' });
}

/** Profilden cikis */
export async function logoutFromProfile(browser, meta) {
  await switchToAppWebView(browser);
  await dismissPostLoginBlockers(browser);
  await safeClick(browser, SELECTORS.navProfile);
  await safeClick(browser, SELECTORS.logoutButton);
  await waitForTestId(browser, SELECTORS.loginPhone, LOGIN_TIMEOUT_MS);
  logSafe('logout', { ...meta, step: 'logout', status: 'ok' });
}

/** Uygulamayi yeniden ac — oturum korunmali */
export async function relaunchAndAssertSession(browser, meta) {
  const appPackage = browser.capabilities['appium:appPackage'] || browser.capabilities.appPackage;
  const appActivity = browser.capabilities['appium:appActivity'] || browser.capabilities.appActivity;
  if (appPackage && appActivity) {
    try {
      await browser.execute('mobile: startActivity', {
        component: `${appPackage}/${appActivity}`,
        action: 'android.intent.action.MAIN',
        flags: '0x10200000',
        waitForLaunch: true
      });
    } catch {
      await browser.activateApp(appPackage);
    }
    await browser.pause(2_000);
  } else {
    await browser.reloadSession();
  }
  await switchToAppWebView(browser);
  await dismissPostLoginBlockers(browser);
  const stillLoggedIn = await isDisplayed(browser, SELECTORS.navHome, 30_000);
  const loginAgain = await isDisplayed(browser, SELECTORS.loginPhone, 3_000);
  if (!stillLoggedIn || loginAgain) {
    throw new Error('Relaunch sonrasi oturum korunmadi');
  }
  logSafe('session-restore', { ...meta, step: 'session-restore', status: 'ok' });
}

/** Admin uye listesi */
export async function verifyAdminMembers(browser, meta) {
  await dismissPostLoginBlockers(browser);

  await switchToAppWebView(browser);
  await safeClick(browser, SELECTORS.navProfile);

  if (!(await isDisplayed(browser, SELECTORS.openAdminPanel, 5_000))) {
    logSafe('admin-skip', { ...meta, step: 'admin-panel', status: 'skipped', code: 'NOT_ADMIN_USER' });
    return;
  }
  await safeClick(browser, SELECTORS.openAdminPanel);

  await waitForTestId(browser, SELECTORS.adminMembersPanel, ADMIN_PANEL_TIMEOUT_MS);

  const started = Date.now();
  let statusText = '';
  while (Date.now() - started < ADMIN_MEMBERS_TIMEOUT_MS) {
    const statusEl = await browser.$(SELECTORS.adminMembersStatus);
    if (await statusEl.isDisplayed()) {
      statusText = await statusEl.getText();
      if (/uye listeleniyor/i.test(statusText)) {
        break;
      }
      if (/yuklenemedi|hata|503|500|timeout/i.test(statusText)) {
        const diag = createApiDiagnostic({
          ...meta,
          path: '/api/admin/members',
          status: 500,
          code: 'ADMIN_MEMBERS_UI_ERROR',
          step: 'admin-members',
          durationMs: Date.now() - started
        });
        logSafe('admin-members-fail', diag);
        throw new Error('Admin uye listesi hata durumunda');
      }
    }
    await browser.pause(1_000);
  }

  if (!/uye listeleniyor/i.test(statusText)) {
    const diag = createApiDiagnostic({
      ...meta,
      path: '/api/admin/members',
      status: 504,
      code: 'ADMIN_MEMBERS_TIMEOUT',
      step: 'admin-members',
      durationMs: Date.now() - started
    });
    logSafe('admin-members-timeout', diag);
    throw new Error('Admin uye listesi zaman asimi');
  }

  logSafe('admin-members', createApiDiagnostic({
    ...meta,
    path: '/api/admin/members',
    status: 200,
    step: 'admin-members',
    durationMs: Date.now() - started
  }));
}

/** Login/logout dongusu */
export async function repeatLoginLogout(browser, meta, cycles = 3) {
  for (let i = 0; i < cycles; i += 1) {
    await loginWithPin(browser, { ...meta, step: `login-cycle-${i + 1}` });
    await logoutFromProfile(browser, { ...meta, step: `logout-cycle-${i + 1}` });
  }
  logSafe('stability-cycles', { ...meta, step: 'stability', status: 'ok', code: String(cycles) });
}