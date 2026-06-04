// Capacitor native uygulama mı kontrol eder (web'de güvenli)
export function isNativeApp() {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(window.Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}
