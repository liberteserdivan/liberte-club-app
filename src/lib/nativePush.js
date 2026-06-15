import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { isNativeApp } from './platform.js';

let listenersAttached = false;

// Native push dinleyicilerini bir kez bağla
function attachNativePushListeners() {
  if (listenersAttached || !isNativeApp()) return;
  listenersAttached = true;

  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    if (import.meta.env.DEV) {
      console.info('[push] foreground', notification?.title || notification);
    }
  });

  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    if (import.meta.env.DEV) {
      console.info('[push] action', action?.notification?.title || action);
    }
  });
}

// iOS/Android native FCM/APNs token al
export async function registerNativePushToken() {
  if (!isNativeApp()) {
    return { ok: false, reason: 'not_native' };
  }

  attachNativePushListeners();

  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === 'prompt') {
    perm = await PushNotifications.requestPermissions();
  }

  if (perm.receive !== 'granted') {
    return { ok: false, reason: 'denied' };
  }

  return new Promise((resolve) => {
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const regHandler = PushNotifications.addListener('registration', (token) => {
      regHandler.then((h) => h.remove());
      errHandler.then((h) => h.remove());
      if (import.meta.env.DEV) {
        console.info('[push] native token', `${String(token.value).slice(0, 12)}…`);
      }
      finish({
        ok: true,
        token: token.value,
        platform: Capacitor.getPlatform()
      });
    });

    const errHandler = PushNotifications.addListener('registrationError', (error) => {
      regHandler.then((h) => h.remove());
      errHandler.then((h) => h.remove());
      finish({ ok: false, reason: error?.error || 'registration_failed' });
    });

    PushNotifications.register().catch((error) => {
      finish({ ok: false, reason: error?.message || 'register_failed' });
    });

    setTimeout(() => finish({ ok: false, reason: 'timeout' }), 12000);
  });
}

// Bildirim izni reddedildiyse ayarlara yönlendirme metni
export function getPushSettingsHint() {
  if (Capacitor.getPlatform() === 'ios') {
    return 'Bildirimler kapalı. Ayarlar → Liberte → Bildirimler yolunu izleyerek açabilirsin.';
  }
  return 'Bildirimler kapalı. Ayarlar → Uygulamalar → Liberte → Bildirimler yolunu izleyerek açabilirsin.';
}
