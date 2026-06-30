import { isIos, isNativeApp, isStandalonePwa, isAndroid } from './platform.js';
import { apiJson } from './apiClient.js';
import { isLocalAuth } from './devAuth.js';
import { getDeviceId } from './deviceId.js';

// Üye bazlı bildirim isteği anahtarları
function dismissKey(customerId) {
  return `libertePushDismissed:${customerId}`;
}

function deviceKey(customerId) {
  return `libertePushDevice:${customerId}`;
}

function detectPushPlatform() {
  if (isNativeApp() && isAndroid()) return 'android';
  if (isNativeApp() && isIos()) return 'ios';
  if (isAndroid()) return 'android-web';
  if (isIos()) return 'ios-web';
  return 'web';
}

// Bu cihazda bildirim kuruldu mu?
export function getLocalPushToken(customerId) {
  return localStorage.getItem(deviceKey(customerId)) || '';
}

export function markPushEnabledOnDevice(customerId, token) {
  if (!customerId || !token) return;
  localStorage.setItem(deviceKey(customerId), token);
  localStorage.removeItem(dismissKey(customerId));
}

export function markPushDismissed(customerId) {
  if (!customerId) return;
  localStorage.setItem(dismissKey(customerId), '1');
}

// Bu cihazdaki yerel push kaydını temizle
export function clearLocalPushDevice(customerId) {
  if (!customerId) return;
  localStorage.removeItem(deviceKey(customerId));
  localStorage.removeItem(dismissKey(customerId));
}

// Sunucuda cihaz tokenını pasifleştir
async function revokePushTokenOnServer(customerId) {
  if (isLocalAuth() || !customerId) return;
  try {
    await apiJson('/api/push/register-device', {
      method: 'POST',
      timeoutMs: 5000,
      retryTransient: false,
      skipUnauthorized: true,
      body: JSON.stringify({
        customerId: Number(customerId),
        token: null,
        permissionStatus: 'denied',
        platform: detectPushPlatform(),
        deviceId: getDeviceId()
      })
    });
  } catch {
    // Çıkış akışı devam etsin
  }
}

// Çıkışta bu cihazın tokenını yerel ve sunucuda pasifleştir.
// commit YAPMAZ — logout sonrası resetDb ile db sıfırlanır; geç gelen commit
// clearLocalDb sonrası PII'yi localStorage'a geri yazıp çökme/yarışma yaratıyordu.
export async function deactivateDevicePushToken(customerId) {
  if (!customerId) return;

  const localToken = getLocalPushToken(customerId);
  if (!localToken) return;

  clearLocalPushDevice(customerId);
  await revokePushTokenOnServer(customerId);
}

// Bu cihazda bildirim isteği gösterilmeli mi?
export function shouldShowPushPrompt(customer, db) {
  if (!customer?.id) return false;
  if (localStorage.getItem(dismissKey(customer.id)) === '1') return false;

  const localToken = getLocalPushToken(customer.id);
  const hasLocalToken = Boolean(
    localToken
    && (db.pushSubscriptions || []).some(
      (row) => Number(row.customerId) === Number(customer.id) && row.token === localToken
    )
  );

  if (hasLocalToken) return false;

  if (isNativeApp()) return true;

  if (!('Notification' in window)) return false;
  if (hasLocalToken && Notification.permission === 'granted') return false;

  return true;
}

// Bildirim açmadan önce kısa açıklama
export function getPushPromptHint() {
  const permissionText = 'Kampanyalar, LP fırsatları ve ikram haklarından haberdar olmak için bildirimleri açabilirsiniz.';
  if (isNativeApp()) {
    return permissionText;
  }
  if (isIos() && !isStandalonePwa()) {
    return `${permissionText} iPhone'da bildirimler için önce Safari'den Ana Ekrana Ekle yap, uygulamayı ana ekrandan aç.`;
  }
  return permissionText;
}

// Bildirim açmadan önce cihaz desteği kontrolü
export function canRequestPushOnThisDevice() {
  if (isNativeApp()) return true;
  if (isIos() && !isStandalonePwa()) return false;
  return true;
}
