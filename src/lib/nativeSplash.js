import { SplashScreen } from '@capacitor/splash-screen';
import { isNativeApp } from './platform.js';

let hideScheduled = false;
let hideCompleted = false;

// Native splash ekranını kapat — React splash hazır olunca App.jsx çağırır
export async function hideNativeSplash() {
  if (!isNativeApp() || hideCompleted) return;

  try {
    await SplashScreen.hide({ fadeOutDuration: 0 });
    hideCompleted = true;
  } catch {
    // Web veya eklenti hazır değilse sessizce geç
  }
}

// Mutlak fail-safe — JS takılsa bile splash'i kapat
export function scheduleNativeSplashFailsafe(ms = 2500) {
  if (!isNativeApp() || hideScheduled) return;
  hideScheduled = true;
  setTimeout(() => {
    void hideNativeSplash();
  }, Math.max(800, Number(ms) || 2500));
}
