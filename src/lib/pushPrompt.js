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
  if (isNativeApp()) {
    return 'Kampanya, ödül ve fırsat bildirimlerini aç — hiçbir şeyi kaçırma.';
  }
  if (isIos() && !isStandalonePwa()) {
    return 'iPhone\'da bildirimler için önce Safari\'den Ana Ekrana Ekle yap, uygulamayı ana ekrandan aç.';
  }
  return 'Kampanya, ödül ve fırsat bildirimlerini aç — hiçbir şeyi kaçırma.';
}

// Bildirim açmadan önce cihaz desteği kontrolü
export function canRequestPushOnThisDevice() {
  if (isNativeApp()) return true;
  if (isIos() && !isStandalonePwa()) return false;
  return true;
}
