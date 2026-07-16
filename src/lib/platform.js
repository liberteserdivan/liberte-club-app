// Capacitor native uygulama mı kontrol eder (web'de güvenli)
export function isNativeApp() {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(window.Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

// iOS / Android native — WKWebView visibilityState güvenilir değil
export function shouldRunClientPoll() {
  if (isNativeApp()) return true;
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

// iOS Capacitor uygulaması
export function isIosNative() {
  if (!isNativeApp()) return false;
  try {
    return window.Capacitor?.getPlatform?.() === 'ios';
  } catch {
    return isIos();
  }
}

// iOS tarayıcı / PWA tespiti
export function isIos() {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

// Android tarayıcı tespiti
export function isAndroid() {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent || '');
}

export function isStandalonePwa() {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.matchMedia?.('(display-mode: standalone)')?.matches
    || window.navigator.standalone
  );
}
