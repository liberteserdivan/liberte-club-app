import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { Capacitor } from '@capacitor/core';
import { isNativeApp } from './platform.js';
import { detectPushTokenType, isFcmRegistrationToken } from './pushTokenFormat.js';
import { handlePushOpenPayload } from './pushNavigation.js';
import { showAndroidForegroundNotification, ensureAndroidNotificationPermission, checkAndroidNotificationPermission } from './androidNotificationPermission.js';
import { formatPushNotification } from './pushNotificationText.js';

let listenersAttached = false;
const tokenRefreshHandlers = new Set();

// FCM token yenilendiğinde kayıt handler'ı
export function onNativeTokenRefresh(handler) {
  if (typeof handler !== 'function') return () => {};
  tokenRefreshHandlers.add(handler);
  return () => tokenRefreshHandlers.delete(handler);
}

function notifyTokenRefresh(token) {
  tokenRefreshHandlers.forEach((handler) => {
    try {
      handler(token);
    } catch {
      // Handler hatası uygulamayı durdurmasın
    }
  });
}

// Native FCM bildirim dinleyicilerini bir kez bağla
export function ensureNativePushNavigation() {
  attachNativePushListeners();
}

function attachNativePushListeners() {
  if (listenersAttached || !isNativeApp()) return;
  listenersAttached = true;

  FirebaseMessaging.addListener('notificationReceived', (event) => {
    if (Capacitor.getPlatform() !== 'android') return;

    const formatted = formatPushNotification(
      event?.notification?.title || event?.data?.title,
      event?.notification?.body || event?.data?.body
    );
    void showAndroidForegroundNotification(formatted.title, formatted.body);
  });

  FirebaseMessaging.addListener('notificationActionPerformed', (action) => {
    handlePushOpenPayload(action?.notification?.data || {});
  });

  FirebaseMessaging.addListener('tokenReceived', (event) => {
    const token = event?.token;
    if (token) notifyTokenRefresh(token);
  });
}

// iOS/Android native FCM token al — Firebase Admin ile uyumlu
export async function registerNativePushToken() {
  if (!isNativeApp()) {
    return { ok: false, reason: 'not_native' };
  }

  attachNativePushListeners();
  const platform = Capacitor.getPlatform();

  try {
    // Android: sistem iznini kontrol et, Firebase izin API'sini atla
    if (platform === 'android') {
      const androidPerm = await ensureAndroidNotificationPermission();
      if (!androidPerm.ok) {
        return { ok: false, reason: 'denied', permissionStatus: 'denied' };
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

      return {
        ok: true,
        token,
        tokenType: 'fcm',
        platform,
        permissionStatus: 'granted'
      };
    }

    let perm = await FirebaseMessaging.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await FirebaseMessaging.requestPermissions();
    }

    if (perm.receive !== 'granted') {
      return { ok: false, reason: 'denied', permissionStatus: perm.receive || 'denied' };
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

    return {
      ok: true,
      token,
      tokenType: 'fcm',
      platform,
      permissionStatus: 'granted'
    };
  } catch (error) {
    return { ok: false, reason: error?.message || 'registration_failed', permissionStatus: 'error' };
  }
}

// Native bildirim izni verilmiş mi?
export async function hasNativePushPermission() {
  if (!isNativeApp()) return false;

  if (Capacitor.getPlatform() === 'android') {
    const check = await checkAndroidNotificationPermission();
    return check.granted;
  }

  try {
    const perm = await FirebaseMessaging.checkPermissions();
    return perm.receive === 'granted';
  } catch {
    return false;
  }
}

// Bildirim izni reddedildiyse ayarlara yönlendirme metni
export function getPushSettingsHint() {
  if (Capacitor.getPlatform() === 'ios') {
    return 'Bildirimler kapalı. Ayarlar → Liberte → Bildirimler yolunu izleyerek açabilirsin.';
  }
  return 'Bildirimler kapalı. Ayarlar → Uygulamalar → Liberte → Bildirimler yolunu izleyerek açabilirsin.';
}
