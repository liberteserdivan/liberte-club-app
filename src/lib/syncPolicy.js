// Uzak veri çekme aralıkları (ms)
export const SYNC_INTERVAL_NORMAL_MS = 60_000;
export const SYNC_INTERVAL_FAST_MS = 9_000;

// Hızlı sync gereken sekmeler — QR / kasa
const FAST_SYNC_TABS = new Set(['qr']);

// Sekme ve role göre polling aralığını seç
export function resolveSyncIntervalMs({ tab = 'home' } = {}) {
  if (FAST_SYNC_TABS.has(tab)) return SYNC_INTERVAL_FAST_MS;
  return SYNC_INTERVAL_NORMAL_MS;
}
