import { bootstrapSession } from './session.js';

const DEFAULT_SESSION_TIMEOUT_MS = 8000;

// Oturum bootstrap — ağ takılırsa uygulama boş ekranda kalmasın
export function bootstrapSessionWithTimeout(timeoutMs = DEFAULT_SESSION_TIMEOUT_MS) {
  return Promise.race([
    bootstrapSession().catch(() => null),
    new Promise((resolve) => {
      setTimeout(() => resolve(null), timeoutMs);
    })
  ]);
}
