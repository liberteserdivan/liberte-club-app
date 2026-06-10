import { registerPlugin } from '@capacitor/core';
import { isAndroid, isNativeApp } from './platform.js';

const LiberteNotifications = registerPlugin('LiberteNotifications');

// Android 13+ sistem bildirim iznini iste
export async function ensureAndroidNotificationPermission() {
  if (!isNativeApp() || !isAndroid()) {
    return { ok: true };
  }

  try {
    await LiberteNotifications.requestPermission();
    return { ok: true };
  } catch {
    return {
      ok: false,
      message: 'Android bildirim izni kapalı. Ayarlar → Uygulamalar → Liberte → Bildirimler\'i aç.'
    };
  }
}
