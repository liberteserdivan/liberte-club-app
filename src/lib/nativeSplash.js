import { isNativeApp } from './platform.js';

// Android native splash — web hazır olunca kapat
export async function hideNativeSplash() {
  if (!isNativeApp()) return;

  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide({ fadeOutDuration: 280 });
  } catch {
    // Web veya eklenti yoksa sessizce geç
  }
}
