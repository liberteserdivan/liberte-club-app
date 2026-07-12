// Capacitor native / platform tespiti
export function isNativeApp() {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(window.Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

export function isIos() {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

export function isAndroid() {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent || '');
}

export function getNativePlatform() {
  if (!isNativeApp()) return 'web';
  try {
    return window.Capacitor?.getPlatform?.() || 'native';
  } catch {
    return 'native';
  }
}
