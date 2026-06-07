import { SplashScreen } from '@capacitor/splash-screen';
import { isNativeApp } from './platform.js';

let hideScheduled = false;

// Native splash ekranını kapat
export async function hideNativeSplash() {
  if (!isNativeApp()) return;

  try {
    await SplashScreen.hide({ fadeOutDuration: 280 });
  } catch {
    // Web veya eklenti hazır değilse sessizce geç
  }
}

// Açılışta splash takılmasını önlemek için birden fazla zamanda dene
export function scheduleNativeSplashHide() {
  if (!isNativeApp() || hideScheduled) return;
  hideScheduled = true;

  void hideNativeSplash();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => hideNativeSplash(), { once: true });
  }

  window.addEventListener('load', () => hideNativeSplash(), { once: true });

  // Capacitor köprüsü geç hazır olursa son çare zamanlayıcıları
  [400, 1200, 2500, 4000].forEach((ms) => {
    setTimeout(() => hideNativeSplash(), ms);
  });
}
