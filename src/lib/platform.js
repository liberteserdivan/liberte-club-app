// Capacitor native uygulama mı kontrol eder (web'de güvenli)
export function isNativeApp() {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(window.Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

// iOS tarayıcı / PWA tespiti
export function isIos() {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

export function isStandalonePwa() {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.matchMedia?.('(display-mode: standalone)')?.matches
    || window.navigator.standalone
  );
}
