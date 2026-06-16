import { isIos, isNativeApp, isStandalonePwa } from './platform.js';

// Üye bazlı bildirim isteği anahtarları
function dismissKey(customerId) {
  return `libertePushDismissed:${customerId}`;
}

function deviceKey(customerId) {
  return `libertePushDevice:${customerId}`;
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

// Çıkışta yalnızca bu cihazın tokenını pasifleştir
export function deactivateDevicePushToken(customerId, db, commit) {
  if (!customerId || typeof commit !== 'function') return;

  const localToken = getLocalPushToken(customerId);
  if (!localToken) return;

  const now = new Date().toLocaleString('tr-TR');
  const pushSubscriptions = (db.pushSubscriptions || []).map((row) => {
    if (row.customerId === customerId && row.token === localToken) {
      return { ...row, active: false, deactivatedAt: now };
    }
    return row;
  });

  clearLocalPushDevice(customerId);
  commit({ ...db, pushSubscriptions });
}

// Bu cihazda bildirim isteği gösterilmeli mi?
export function shouldShowPushPrompt(customer, db) {
  if (!customer?.id) return false;
  if (localStorage.getItem(dismissKey(customer.id)) === '1') return false;

  const localToken = getLocalPushToken(customer.id);
  const hasLocalToken = Boolean(
    localToken
    && (db.pushSubscriptions || []).some(
      (row) => row.customerId === customer.id && row.token === localToken
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
