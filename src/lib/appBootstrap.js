import { bootstrapSession } from './session.js';
import { isNativeApp } from './platform.js';

const WEB_SESSION_TIMEOUT_MS = 5_000;
const NATIVE_SESSION_TIMEOUT_MS = 4_000;

// Oturum bootstrap — ağ takılırsa uygulama boş ekranda kalmasın; arka plan retry yok
export function bootstrapSessionWithTimeout(timeoutMs) {
  const limit = Number(timeoutMs) > 0
    ? Number(timeoutMs)
    : (isNativeApp() ? NATIVE_SESSION_TIMEOUT_MS : WEB_SESSION_TIMEOUT_MS);

  let settled = false;
  return Promise.race([
    bootstrapSession().then((result) => {
      if (settled) return null;
      settled = true;
      return result;
    }).catch(() => null),
    new Promise((resolve) => {
      setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve(null);
      }, limit);
    })
  ]);
}
