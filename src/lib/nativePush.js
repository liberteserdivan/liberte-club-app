import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { Capacitor } from '@capacitor/core';
import { isNativeApp } from './platform.js';
import { detectPushTokenType, isFcmRegistrationToken } from './pushTokenFormat.js';

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
function attachNativePushListeners() {
  if (listenersAttached || !isNativeApp()) return;
  listenersAttached = true;

  FirebaseMessaging.addListener('notificationReceived', () => {
    // Foreground bildirim — platform gösterir
  });

  FirebaseMessaging.addListener('notificationActionPerformed', (action) => {
    const url = action?.notification?.data?.url || action?.notification?.data?.link;
    if (url && typeof window !== 'undefined') {
      try {
        const target = new URL(String(url), window.location.origin);
        if (target.origin === window.location.origin || target.hostname === 'app.liberte.cafe') {
          window.location.href = target.href;
        }
      } catch {
        // Geçersiz URL — sessizce geç
      }
    }
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

  try {
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
      platform: Capacitor.getPlatform(),
      permissionStatus: 'granted'
    };
  } catch (error) {
    return { ok: false, reason: error?.message || 'registration_failed', permissionStatus: 'error' };
  }
}

// Native bildirim izni verilmiş mi?
export async function hasNativePushPermission() {
  if (!isNativeApp()) return false;
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
