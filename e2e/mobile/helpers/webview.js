// Capacitor WebView baglamina gecis

const WEBVIEW_TIMEOUT_MS = 90_000;

/** Aktif WebView baglamina gec */
export async function switchToAppWebView(browser) {
  const deadline = Date.now() + WEBVIEW_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const contexts = await browser.getContexts();
    const webview = contexts.find((ctx) => String(ctx).includes('WEBVIEW'));
    if (webview) {
      await browser.switchContext(webview);
      return webview;
    }
    await browser.pause(800);
  }
  throw new Error('WebView baglami bulunamadi');
}

/** data-testid ile oge bekle */
export async function waitForTestId(browser, selector, timeoutMs = 30_000) {
  const el = await browser.$(selector);
  await el.waitForDisplayed({ timeout: timeoutMs });
  return el;
}

/** Gorunur mu kontrol et */
export async function isDisplayed(browser, selector, timeoutMs = 4_000) {
  try {
    const el = await browser.$(selector);
    await el.waitForDisplayed({ timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

/** Alt nav ile cakismayi onlemek icin guvenli tikla */
export async function safeClick(browser, selector, timeoutMs = 30_000) {
  const el = await browser.$(selector);
  await el.waitForDisplayed({ timeout: timeoutMs });
  await el.scrollIntoView({ block: 'center', inline: 'nearest' });
  await browser.pause(400);
  try {
    await el.click();
  } catch {
    await browser.execute((css) => document.querySelector(css)?.click(), selector);
  }
}