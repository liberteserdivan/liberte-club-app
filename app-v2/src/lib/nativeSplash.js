import { SplashScreen } from "@capacitor/splash-screen";
import { Capacitor } from "@capacitor/core";

export async function hideNativeSplash() {
  try {
    if (!Capacitor.isNativePlatform?.()) return;
    await SplashScreen.hide({ fadeOutDuration: 0 });
  } catch {
    // Plugin yoksa sessiz
  }
}