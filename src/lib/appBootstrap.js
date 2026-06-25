import { bootstrapSession } from './session.js';
import { isNativeApp } from './platform.js';

const WEB_SESSION_TIMEOUT_MS = 20_000;
const NATIVE_SESSION_TIMEOUT_MS = 35_000;

// Oturum bootstrap — ağ takılırsa uygulama boş ekranda kalmasın
export function bootstrapSessionWithTimeout(timeoutMs) {
  const limit = Number(timeoutMs) > 0
    ? Number(timeoutMs)
    : (isNativeApp() ? NATIVE_SESSION_TIMEOUT_MS : WEB_SESSION_TIMEOUT_MS);

  return Promise.race([
    bootstrapSession().catch(() => null),
    new Promise((resolve) => {
      setTimeout(() => resolve(null), limit);
    })
  ]);
}
