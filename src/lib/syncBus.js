const SYNC_EVENT = 'liberte:sync-request';

// Kasada LP sonrası veya manuel yenileme — useCommit dinler
export function requestRemoteSync(force = true) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { force } }));
}

// Sync isteği aboneliği
export function subscribeRemoteSyncRequest(handler) {
  if (typeof window === 'undefined') return () => {};

  function onEvent(event) {
    const force = event?.detail?.force !== false;
    handler(force);
  }

  window.addEventListener(SYNC_EVENT, onEvent);
  return () => window.removeEventListener(SYNC_EVENT, onEvent);
}
