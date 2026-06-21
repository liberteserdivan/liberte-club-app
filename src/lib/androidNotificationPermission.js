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

// Uygulama ön plandayken FCM mesajını sistem bildirimi olarak göster
export async function showAndroidForegroundNotification(title, body) {
  if (!isNativeApp() || !isAndroid()) return;

  try {
    await LiberteNotifications.showLocalNotification({
      title: String(title || 'Liberte').trim() || 'Liberte',
      body: String(body || '').trim(),
      channelId: 'liberte_campaign'
    });
  } catch {
    // Eski APK'da native metod yoksa sessizce geç
  }
}
