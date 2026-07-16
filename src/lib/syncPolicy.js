// Uzak veri çekme aralıkları (ms)
export const SYNC_INTERVAL_NORMAL_MS = 60_000;
// QR/kasa sekmesi — eskiden 5sn'de bir poll vardı; bu, ilk tam pull öncesinde
// tam /api/state çağrısına dönüşüp egress'i şişiriyordu. Realtime + since-probe
// güncel veriyi zaten getiriyor; aralık 15sn'ye çekildi.
export const SYNC_INTERVAL_FAST_MS = 15_000;

// Safe Mode açıkken polling daha da seyrekleştirilir (sunucu yükü azaltma)
export const SYNC_INTERVAL_SAFE_MODE_MS = 120_000;

// Hızlı sync gereken sekmeler — QR / kasa
const FAST_SYNC_TABS = new Set(['qr']);

// Sekme ve role göre polling aralığını seç.
// Safe Mode "reduced" ise normal aralığın en az 2 katına çıkarılır (egress düşer).
export function resolveSyncIntervalMs({ tab = 'home', safeModeReduced = false } = {}) {
  const base = FAST_SYNC_TABS.has(tab) ? SYNC_INTERVAL_FAST_MS : SYNC_INTERVAL_NORMAL_MS;
  if (safeModeReduced) return Math.max(SYNC_INTERVAL_SAFE_MODE_MS, base * 2);
  return base;
}
