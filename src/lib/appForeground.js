import { isNativeApp } from './platform.js';

let nativeActive = true;
let bridgeReady = false;
let debounceTimer = null;
const resumeListeners = new Set();

// Native uygulama ön planda mı?
export function isNativeAppActive() {
  if (!isNativeApp()) return true;
  return nativeActive;
}

// Ön plana dönüş — tek merkezden, debounce ile
export function subscribeForegroundResume(handler) {
  resumeListeners.add(handler);
  return () => resumeListeners.delete(handler);
}

function notifyForegroundResume() {
  resumeListeners.forEach((handler) => {
    try {
      handler();
    } catch {
      // Dinleyici hatası diğerlerini engellemesin
    }
  });
}

function scheduleForegroundResume() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    notifyForegroundResume();
  }, 350);
}

// Capacitor appStateChange — yalnızca bir kez kayıt
export function initNativeForegroundBridge() {
  if (bridgeReady || !isNativeApp()) return;
  bridgeReady = true;

  import('@capacitor/app').then(({ App }) => {
    App.addListener('appStateChange', ({ isActive }) => {
      nativeActive = Boolean(isActive);
      if (nativeActive) scheduleForegroundResume();
    }).catch(() => {});
  }).catch(() => {});
}
