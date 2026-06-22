import { registerPlugin } from '@capacitor/core';
import { isAndroid, isNativeApp } from './platform.js';

const LiberteNotifications = registerPlugin('LiberteNotifications');

// Android sistem bildirim iznini oku — ayarlardan açılmışsa da algılar
export async function checkAndroidNotificationPermission() {
  if (!isNativeApp() || !isAndroid()) {
    return { granted: true };
  }

  try {
    const result = await LiberteNotifications.checkPermission();
    return { granted: Boolean(result?.granted) };
  } catch {
    return { granted: false };
  }
}

// Android 13+ sistem bildirim iznini iste
export async function ensureAndroidNotificationPermission() {
  if (!isNativeApp() || !isAndroid()) {
    return { ok: true };
  }

  const before = await checkAndroidNotificationPermission();
  if (before.granted) {
    return { ok: true };
  }

  try {
    await LiberteNotifications.requestPermission();
  } catch {
    // Sistem diyaloğu reddedildi — ayarlardan açılabilir
  }

  const after = await checkAndroidNotificationPermission();
  if (after.granted) {
    return { ok: true };
  }

  return {
    ok: false,
    message: 'Android bildirim izni kapalı. Ayarlar → Uygulamalar → Liberte → Bildirimler\'i aç.'
  };
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
