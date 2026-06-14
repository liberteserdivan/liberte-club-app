import { SplashScreen } from '@capacitor/splash-screen';
import { isNativeApp } from './platform.js';

// Native splash ekranını kapat — React splash hazır olunca App.jsx çağırır
export async function hideNativeSplash() {
  if (!isNativeApp()) return;

  try {
    await SplashScreen.hide({ fadeOutDuration: 0 });
  } catch {
    // Web veya eklenti hazır değilse sessizce geç
  }
}
