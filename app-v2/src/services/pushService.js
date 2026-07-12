import { Capacitor } from '@capacitor/core';
import { apiJson } from '../lib/apiClient.js';
import { getDeviceId } from '../lib/deviceId.js';
import { isNativeApp, getNativePlatform } from '../lib/platform.js';

const DEVICE_TOKEN_KEY = (customerId) => `libertePushDevice:${customerId}`;
const DISMISS_KEY = (customerId) => `libertePushDismissed:${customerId}`;

export function getLocalPushToken(customerId) {
  try { return localStorage.getItem(DEVICE_TOKEN_KEY(customerId)) || ''; } catch { return ''; }
}

export function markPushEnabled(customerId, token) {
  try {
    localStorage.setItem(DEVICE_TOKEN_KEY(customerId), token);
    localStorage.removeItem(DISMISS_KEY(customerId));
  } catch { /* yoksay */ }
}

export function hasActivePush(customerId, pushSubscriptions = []) {
  const local = getLocalPushToken(customerId);
  if (!local) return false;
  return pushSubscriptions.some((row) => (
    Number(row.customerId) === Number(customerId)
    && row.token === local
    && row.active !== false
  ));
}

async function syncToken(customerId, token, permissionStatus) {
  const platform = isNativeApp() ? getNativePlatform() : 'web';
  const { response, data } = await apiJson('/api/push/register-device', {
    method: 'POST',
    timeoutMs: 8000,
    retryTransient: false,
    skipUnauthorized: true,
    body: JSON.stringify({
      customerId: Number(customerId),
      token,
      permissionStatus,
      platform,
      deviceId: getDeviceId()
    })
  });
  return { ok: response.ok, data };
}

// Native FCM token al ve sunucuya yaz
export async function enableNativePush(customerId) {
  if (!isNativeApp()) {
    throw new Error('Bildirimler native uygulamada açılır.');
  }

  const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
  const platform = Capacitor.getPlatform();

  if (platform === 'android') {
    try {
      const LiberteNotifications = Capacitor.Plugins?.LiberteNotifications;
      if (LiberteNotifications?.requestPermission) {
        await LiberteNotifications.requestPermission();
      }
    } catch { /* eski APK */ }
  } else {
    let perm = await FirebaseMessaging.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await FirebaseMessaging.requestPermissions();
    }
    if (perm.receive !== 'granted') {
      throw new Error('Bildirim izni kapalı. Ayarlardan açıp tekrar dene.');
    }
  }

  const { token } = await FirebaseMessaging.getToken();
  if (!token) throw new Error('Bildirim token alınamadı.');

  const sync = await syncToken(customerId, token, 'granted');
  if (!sync.ok) throw new Error(sync.data?.error || 'Bildirim kaydı başarısız.');

  markPushEnabled(customerId, token);
  return token;
}

export async function ensurePushIfPermitted(customerId) {
  if (!isNativeApp() || !customerId) return;
  try {
    const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
    const perm = await FirebaseMessaging.checkPermissions();
    if (perm.receive !== 'granted') return;
    if (getLocalPushToken(customerId)) {
      await syncToken(customerId, getLocalPushToken(customerId), 'granted');
      return;
    }
    await enableNativePush(customerId);
  } catch {
    // Arka plan — sessiz
  }
}
