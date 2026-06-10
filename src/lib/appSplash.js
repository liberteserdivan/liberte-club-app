import { isNativeApp } from './platform.js';

const SPLASH_SEEN_KEY = 'liberteSplashSeen';

// Oturum başına bir kez açılış splash göster — yalnızca web/PWA
export function shouldShowAppSplash() {
  if (isNativeApp()) return false;
  if (typeof sessionStorage === 'undefined') return false;
  return sessionStorage.getItem(SPLASH_SEEN_KEY) !== '1';
}

export function markAppSplashSeen() {
  try {
    sessionStorage.setItem(SPLASH_SEEN_KEY, '1');
  } catch {
    // Gizli mod vb.
  }
}

export function getInitialSplashPhase() {
  return shouldShowAppSplash() ? 'visible' : 'hidden';
}
