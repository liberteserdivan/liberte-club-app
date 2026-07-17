import { registerPlugin } from '@capacitor/core';
import { isAndroid, isNativeApp } from './platform.js';

const LiberteNotifications = registerPlugin('LiberteNotifications');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Android sistem bildirim iznini oku — ayarlardan açılmışsa da algılar
export async function checkAndroidNotificationPermission() {
  if (!isNativeApp() || !isAndroid()) {
    return { granted: true };
  }

  try {
    const result = await LiberteNotifications.checkPermission();
    return { granted: Boolean(result?.granted) };
  } catch {
    // Plugin yoksa (eski APK) false — sessizce ayarlara yönlendirilir
    return { granted: false };
  }
}

// OEM'lerde Allow sonrası areNotificationsEnabled kısa süre false kalabilir
export async function waitForAndroidNotificationPermission({
  attempts = 8,
  delayMs = 150
} = {}) {
  for (let i = 0; i < attempts; i += 1) {
    const { granted } = await checkAndroidNotificationPermission();
    if (granted) return true;
    if (i < attempts - 1) await sleep(delayMs);
  }
  return false;
}

// Android 13+ sistem bildirim iznini iste
export async function ensureAndroidNotificationPermission() {
  if (!isNativeApp() || !isAndroid()) {
    return { ok: true };
  }

  if (await waitForAndroidNotificationPermission({ attempts: 1, delayMs: 0 })) {
    return { ok: true };
  }

  try {
    await LiberteNotifications.requestPermission();
  } catch {
    // Sistem diyaloğu reddedildi — ayarlardan açılabilir
  }

  if (await waitForAndroidNotificationPermission()) {
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
