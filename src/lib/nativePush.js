import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { Capacitor } from '@capacitor/core';
import { isNativeApp } from './platform.js';
import { detectPushTokenType, isFcmRegistrationToken } from './pushTokenFormat.js';

let listenersAttached = false;

// Native FCM bildirim dinleyicilerini bir kez bağla
function attachNativePushListeners() {
  if (listenersAttached || !isNativeApp()) return;
  listenersAttached = true;

  FirebaseMessaging.addListener('notificationReceived', (event) => {
    if (import.meta.env.DEV) {
      console.info('[push] foreground', event?.notification?.title || event);
    }
  });

  FirebaseMessaging.addListener('notificationActionPerformed', (action) => {
    if (import.meta.env.DEV) {
      console.info('[push] action', action?.notification?.title || action);
    }
  });
}

// iOS/Android native FCM token al — Firebase Admin ile uyumlu
export async function registerNativePushToken() {
  if (!isNativeApp()) {
    return { ok: false, reason: 'not_native' };
  }

  attachNativePushListeners();

  try {
    let perm = await FirebaseMessaging.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await FirebaseMessaging.requestPermissions();
    }

    if (perm.receive !== 'granted') {
      return { ok: false, reason: 'denied' };
    }

    const { token } = await FirebaseMessaging.getToken();
    if (!token) {
      return { ok: false, reason: 'empty_token' };
    }

    const tokenType = detectPushTokenType(token);
    if (!isFcmRegistrationToken(token)) {
      return {
        ok: false,
        reason: tokenType === 'apns'
          ? 'apns_token_not_supported'
          : 'invalid_fcm_token'
      };
    }

    if (import.meta.env.DEV) {
      console.info('[push] fcm token', `${String(token).slice(0, 12)}…`);
    }

    return {
      ok: true,
      token,
      tokenType: 'fcm',
      platform: Capacitor.getPlatform()
    };
  } catch (error) {
    return { ok: false, reason: error?.message || 'registration_failed' };
  }
}

// Bildirim izni reddedildiyse ayarlara yönlendirme metni
export function getPushSettingsHint() {
  if (Capacitor.getPlatform() === 'ios') {
    return 'Bildirimler kapalı. Ayarlar → Liberte → Bildirimler yolunu izleyerek açabilirsin.';
  }
  return 'Bildirimler kapalı. Ayarlar → Uygulamalar → Liberte → Bildirimler yolunu izleyerek açabilirsin.';
}
