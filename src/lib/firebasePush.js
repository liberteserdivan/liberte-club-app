import { firebaseConfig as defaultConfig, firebaseVapidKey as defaultVapidKey, NOTIFICATION_BADGE, NOTIFICATION_ICON } from './constants.js';
import { apiFetch } from './apiClient.js';
import { patchFirebaseReferrer } from './firebaseReferrerPatch.js';
import { markPushEnabledOnDevice, getLocalPushToken } from './pushPrompt.js';
import { resolvePushChannel } from './pushAudience.js';
import { formatPushNotification } from './pushNotificationText.js';
import { isAndroid, isIos, isNativeApp } from './platform.js';
import { ensureAndroidNotificationPermission } from './androidNotificationPermission.js';
import { registerNativePushToken, getPushSettingsHint, hasNativePushPermission, onNativeTokenRefresh } from './nativePush.js';
import { Capacitor } from '@capacitor/core';
import { reportError } from './errorHub.js';
import { getDeviceId } from './deviceId.js';
import { apiJson } from './apiClient.js';

// Sunucuya cihaz token kaydı — session cookie ile doğrulanır
async function syncPushDeviceRegistration(customer, {
  token = null,
  permissionStatus = 'unknown',
  platform = detectPushPlatform()
}) {
  if (!customer?.id) return { ok: false };

  try {
    const { response, data } = await apiJson('/api/push/register-device', {
      method: 'POST',
      body: JSON.stringify({
        customerId: customer.id,
        token,
        platform,
        deviceId: getDeviceId(),
        permissionStatus,
        appVersion: import.meta.env?.VITE_APP_VERSION || '1.1.2',
        buildNumber: String(import.meta.env?.VITE_BUILD_NUMBER || '')
      })
    });
    return { ok: response.ok, data };
  } catch (error) {
    console.warn('[push.register-device]', error?.message || error);
    return { ok: false };
  }
}

// İzin sonucunu logla — store review için
function logPushPermissionResult(source, result) {
  if (!import.meta.env.PROD) return;
  console.info('[push.permission]', source, {
    status: result?.permissionStatus || result?.reason || 'unknown',
    ok: Boolean(result?.ok)
  });
}

// Service worker yolu — Capacitor WebView'da göreli yol gerekir
export function getFirebaseSwUrl() {
  if (isNativeApp()) return './firebase-messaging-sw.js';
  return '/firebase-messaging-sw.js';
}

export const FIREBASE_SW_URL = '/firebase-messaging-sw.js';
export const PUSH_SITE_ORIGIN = 'https://app.liberte.cafe';

// Firebase API key referrer — native uygulama localhost'tan servis edilir
export function getFirebaseReferrerOrigin() {
  if (isNativeApp()) return PUSH_SITE_ORIGIN;
  if (typeof window !== 'undefined') return window.location.origin;
  return PUSH_SITE_ORIGIN;
}

// Tarayıcı bildirimi göster — iOS PWA'da yalnızca SW üzerinden çalışır
export async function showPushNotification(payload) {
  if (Notification.permission !== 'granted') return;

  const formatted = formatPushNotification(
    payload?.notification?.title || payload?.data?.title,
    payload?.notification?.body || payload?.data?.body
  );

  const options = {
    body: formatted.body || undefined,
    icon: `${PUSH_SITE_ORIGIN}${NOTIFICATION_ICON}`,
    badge: `${PUSH_SITE_ORIGIN}${NOTIFICATION_BADGE}`,
    tag: 'liberte-club-push',
    data: {
      ...(payload?.data || {}),
      url: payload?.data?.url || PUSH_SITE_ORIGIN
    }
  };

  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.ready;
    return registration.showNotification(formatted.title, options);
  }

  return new Notification(formatted.title, options);
}

let foregroundListenerAttached = false;

// iOS'ta onMessage sessiz push sayılır — bildirimleri yalnızca SW gösterir
function attachForegroundPushListener(messaging, onMessage) {
  if (isIos() || foregroundListenerAttached) return;
  onMessage(messaging, showPushNotification);
  foregroundListenerAttached = true;
}

// Uygulama açıkken gelen push mesajlarını dinle (Android)
export async function startPushForegroundListener() {
  if (!import.meta.env.PROD) return;
  if (Notification.permission !== 'granted') return;
  if (isIos()) return;
  if (foregroundListenerAttached) return;

  const { initializeApp, getApps } = await import('firebase/app');
  const { getMessaging, onMessage, isSupported } = await import('firebase/messaging');

  if (!(await isSupported())) return;

  patchFirebaseReferrer(getFirebaseReferrerOrigin());
  const config = await resolveFirebaseConfig();
  const app = getApps().length ? getApps()[0] : initializeApp(config);
  const messaging = getMessaging(app);

  attachForegroundPushListener(messaging, onMessage);
}

// Firebase messaging service worker kaydını hazırla
async function ensureServiceWorkerRegistration() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service worker desteklenmiyor.');
  }

  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing?.active?.scriptURL?.includes('firebase-messaging-sw')) {
    await existing.update();
    await navigator.serviceWorker.ready;
    return existing;
  }

  const swUrl = getFirebaseSwUrl();
  const registration = await navigator.serviceWorker.register(swUrl, { scope: './' });
  await registration.update();
  await navigator.serviceWorker.ready;
  return registration;
}

// Ortam değişkeni varsa kullan, boş string ile varsayılanı ezme
function envOrDefault(key, fallback) {
  const value = import.meta.env[key];
  if (typeof value === 'string' && value.trim()) return value.trim();
  return fallback;
}

// Build-time Firebase config
export function getFirebaseConfig() {
  return {
    apiKey: envOrDefault('VITE_FIREBASE_API_KEY', defaultConfig.apiKey),
    authDomain: envOrDefault('VITE_FIREBASE_AUTH_DOMAIN', defaultConfig.authDomain),
    projectId: envOrDefault('VITE_FIREBASE_PROJECT_ID', defaultConfig.projectId),
    storageBucket: envOrDefault('VITE_FIREBASE_STORAGE_BUCKET', defaultConfig.storageBucket),
    messagingSenderId: envOrDefault('VITE_FIREBASE_MESSAGING_SENDER_ID', defaultConfig.messagingSenderId),
    appId: envOrDefault('VITE_FIREBASE_APP_ID', defaultConfig.appId),
    measurementId: envOrDefault('VITE_FIREBASE_MEASUREMENT_ID', defaultConfig.measurementId)
  };
}

let cachedFirebaseConfig = null;

// Runtime config — Vercel FIREBASE_WEB_API_KEY ile güncellenir
export async function resolveFirebaseConfig() {
  if (cachedFirebaseConfig) return cachedFirebaseConfig;

  try {
    const response = await apiFetch('/api/config?resource=firebase');
    if (response.ok) {
      const data = await response.json();
      if (data?.apiKey) {
        cachedFirebaseConfig = data;
        return cachedFirebaseConfig;
      }
    }
  } catch {
    // Sunucu yanıt vermezse build-time config kullan
  }

  cachedFirebaseConfig = getFirebaseConfig();
  return cachedFirebaseConfig;
}

// Web push VAPID anahtarını döndür
export function getVapidKey() {
  return envOrDefault('VITE_FIREBASE_VAPID_KEY', defaultVapidKey || '');
}

// Build-time yoksa sunucudan VAPID al — geçersiz build değeri API'yi ezmesin
let cachedVapidKey = '';

export async function resolveVapidKey() {
  const fromBuild = getVapidKey();
  if (isValidVapidPublicKey(fromBuild)) return fromBuild;
  if (cachedVapidKey && isValidVapidPublicKey(cachedVapidKey)) return cachedVapidKey;

  try {
    const response = await apiFetch('/api/config?resource=push');
    if (response.ok) {
      const data = await response.json();
      cachedVapidKey = String(data.vapidKey || '').trim();
      if (isValidVapidPublicKey(cachedVapidKey)) return cachedVapidKey;
    }
  } catch {
    // Sunucu yanıt vermezse sessizce devam et
  }

  if (isValidVapidPublicKey(defaultVapidKey)) return defaultVapidKey.trim();

  return '';
}

// VAPID public key formatını doğrula
function isValidVapidPublicKey(key) {
  const normalized = String(key || '').trim().replace(/\s+/g, '');
  if (normalized.length < 80 || normalized.length > 200) return false;
  return /^[A-Za-z0-9_-]+$/.test(normalized);
}

// Push hata mesajını kullanıcı dostu metne çevir
function mapPushError(error) {
  const message = error?.message || String(error || '');

  if (error?.message === 'VAPID_MISSING' || error?.message === 'VAPID_INVALID') {
    return 'Bildirimler şu an kullanılamıyor. Lütfen daha sonra tekrar dene.';
  }

  if (message.includes('applicationServerKey is not valid')) {
    return 'Bildirim ayarları güncelleniyor. Lütfen bir süre sonra tekrar dene.';
  }

  if (message.includes('API key not valid') || message.includes('INVALID_ARGUMENT') || message.includes('PERMISSION_DENIED')) {
    return 'Bildirim servisine bağlanılamadı. Uygulamayı yeniden başlatıp tekrar dene.';
  }

  if (message.includes('installations') || message.includes('request-failed')) {
    return 'Bildirim servisine bağlanılamadı. İnternet bağlantını kontrol et.';
  }

  if (
    message.includes('push service error')
    || message.includes('Registration failed')
    || message.includes('token-subscribe-failed')
  ) {
    return 'Bildirim kaydı tamamlanamadı. Uygulamayı yeniden başlat ve tekrar dene.';
  }

  if (message.includes('messaging/permission-blocked')) {
    return 'Bildirim izni telefon ayarlarından kapalı. Ayarlardan Liberte Club bildirimlerini aç.';
  }

  if (message.includes('Android bildirim izni')) {
    return message;
  }

  if (message.includes('Service worker')) {
    return 'Bildirimler bu cihazda desteklenmiyor. Uygulamayı mağazadan indirerek dene.';
  }

  return 'Bildirimler açılamadı. Telefon ayarlarından izin verip tekrar dene.';
}

// Bildirim kanalı — native uygulama mı tarayıcı/PWA mı
function detectPushChannel() {
  return isNativeApp() ? 'native' : 'web';
}

// Cihaz platformu — yalnızca native uygulamada ios/android; tarayıcı her zaman web
function detectPushPlatform() {
  if (isNativeApp()) return Capacitor.getPlatform();
  return 'web';
}

// Native kayıt sonrası aynı üyenin eski web tokenlarını pasifleştir
function deactivateWebPushTokensForCustomer(db, customerId, keepToken) {
  const now = new Date().toLocaleString('tr-TR');
  return (db.pushSubscriptions || []).map((row) => {
    if (Number(row.customerId) !== Number(customerId)) return row;
    if (row.token === keepToken) return row;
    const channel = row.channel === 'native' ? 'native' : 'web';
    if (channel !== 'web') return row;
    return {
      ...row,
      active: false,
      deactivatedAt: now,
      deactivatedReason: 'replaced_by_native'
    };
  });
}

// Üye başına birden fazla cihaz — token kaydını güncelle
function upsertPushSubscription(db, customer, token) {
  const others = (db.pushSubscriptions || []).filter((row) => row.token !== token);
  const existing = (db.pushSubscriptions || []).find((row) => row.token === token);
  const platform = detectPushPlatform();
  const channel = detectPushChannel();
  const now = new Date().toLocaleString('tr-TR');
  const appVersion = import.meta.env?.VITE_APP_VERSION || '1.1.0';

  const base = {
    customerId: customer.id,
    userId: customer.id,
    name: customer.name,
    phone: customer.phone,
    token,
    platform,
    channel,
    permissionStatus: 'granted',
    active: true,
    lastSeenAt: now,
    appVersion,
    updatedAt: now
  };

  const nextRow = existing
    ? { ...existing, ...base, createdAt: existing.createdAt || now }
    : { id: Date.now(), ...base, createdAt: now };

  let pushSubscriptions = [...others, nextRow];
  if (channel === 'native') {
    pushSubscriptions = deactivateWebPushTokensForCustomer(
      { ...db, pushSubscriptions },
      customer.id,
      token
    );
  }

  return { ...db, pushSubscriptions };
}

// Native uygulamada Capacitor push token kaydı
export async function enableNativePush(customer, db, commit) {
  if (isAndroid()) {
    const androidPermission = await ensureAndroidNotificationPermission();
    if (!androidPermission.ok) {
      throw new Error(getPushSettingsHint());
    }
  }

  const result = await registerNativePushToken();
  logPushPermissionResult('native', result);

  if (!result.ok) {
    await syncPushDeviceRegistration(customer, {
      permissionStatus: result.permissionStatus || result.reason || 'denied',
      platform: result.platform || detectPushPlatform()
    });
    if (result.reason === 'denied') {
      throw new Error(getPushSettingsHint());
    }
    if (result.reason === 'apns_token_not_supported' || result.reason === 'invalid_fcm_token') {
      throw new Error('Push yapılandırması eksik. Firebase native config dosyalarını kontrol edin.');
    }
    throw new Error('Bildirim kurulamadı. Daha sonra tekrar deneyebilirsin.');
  }

  commit(upsertPushSubscription(db, customer, result.token));
  markPushEnabledOnDevice(customer.id, result.token);
  await syncPushDeviceRegistration(customer, {
    token: result.token,
    permissionStatus: 'granted',
    platform: result.platform || detectPushPlatform()
  });
  return result.token;
}

// Push bildirimlerini etkinleştir
export async function enablePush(customer, db, commit) {
  if (isNativeApp()) {
    return enableNativePush(customer, db, commit);
  }

  const { initializeApp, getApps, deleteApp } = await import('firebase/app');
  const { getMessaging, getToken, isSupported, onMessage } = await import('firebase/messaging');

  if (!('Notification' in window)) {
    throw new Error('Bu cihaz bildirim desteklemiyor.');
  }

  const supported = await isSupported();
  if (!supported) {
    throw new Error('Bu tarayıcı web push desteklemiyor. iPhone kullanıyorsan uygulamayı ana ekrana ekleyip oradan aç.');
  }

  const vapidKey = await resolveVapidKey();
  if (!vapidKey) {
    throw new Error('VAPID_MISSING');
  }
  if (!isValidVapidPublicKey(vapidKey)) {
    throw new Error('VAPID_INVALID');
  }

  const androidPermission = await ensureAndroidNotificationPermission();
  if (!androidPermission.ok) {
    throw new Error(androidPermission.message || 'Android bildirim izni verilmedi.');
  }

  let permission = Notification.permission;
  if (permission !== 'granted') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') {
    await syncPushDeviceRegistration(customer, {
      permissionStatus: permission === 'denied' ? 'denied' : 'prompt',
      platform: detectPushPlatform()
    });
    throw new Error('Bildirim izni verilmedi.');
  }

  const config = await resolveFirebaseConfig();
  if (!config.apiKey) {
    throw new Error('Firebase API anahtarı bulunamadı.');
  }

  // Önceki Firebase app farklı config ile açıldıysa kapat
  for (const app of getApps()) {
    await deleteApp(app);
  }

  // HTTP referrer kısıtlı API key ile Firebase Installations için
  patchFirebaseReferrer(getFirebaseReferrerOrigin());
  const registration = await ensureServiceWorkerRegistration();

  const app = initializeApp(config);
  const messaging = getMessaging(app);

  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration
  });

  if (!token) {
    throw new Error('Bildirim tokenı alınamadı.');
  }

  commit(upsertPushSubscription(db, customer, token));
  markPushEnabledOnDevice(customer.id, token);
  await syncPushDeviceRegistration(customer, {
    token,
    permissionStatus: 'granted',
    platform: detectPushPlatform()
  });

  attachForegroundPushListener(messaging, onMessage);

  return token;
}

// Native cihazda kayıtlı token varsa yenile
export async function refreshNativePushIfSubscribed(customer, db, commit) {
  if (!import.meta.env.PROD) return;
  if (!isNativeApp() || !customer?.id) return;

  const localToken = getLocalPushToken(customer.id);
  if (!localToken) return;

  const onThisDevice = (db.pushSubscriptions || []).some(
    (row) => row.customerId === customer.id && row.token === localToken
  );
  if (!onThisDevice) return;

  try {
    const result = await registerNativePushToken();
    if (!result.ok || !result.token || result.token === localToken) return;
    commit(upsertPushSubscription(db, customer, result.token));
    markPushEnabledOnDevice(customer.id, result.token);
  } catch {
    // Arka planda sessizce dene
  }
}

// Kayıtlı üyede token yenile — SW sıfırlamadan, yalnızca bu cihazda
export async function refreshPushTokenIfSubscribed(customer, db, commit) {
  if (isNativeApp()) {
    return refreshNativePushIfSubscribed(customer, db, commit);
  }

  if (!import.meta.env.PROD) return;
  if (!customer?.id) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!('serviceWorker' in navigator)) return;

  const localToken = getLocalPushToken(customer.id);
  if (!localToken) return;

  const onThisDevice = (db.pushSubscriptions || []).some(
    (row) => row.customerId === customer.id && row.token === localToken
  );
  if (!onThisDevice) return;

  try {
    const { initializeApp, getApps, deleteApp } = await import('firebase/app');
    const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
    if (!(await isSupported())) return;

    const vapidKey = await resolveVapidKey();
    if (!isValidVapidPublicKey(vapidKey)) return;

    const config = await resolveFirebaseConfig();
    if (!config.apiKey) return;

    const registration = await ensureServiceWorkerRegistration();

    for (const app of getApps()) {
      await deleteApp(app);
    }

    patchFirebaseReferrer(getFirebaseReferrerOrigin());
    const app = initializeApp(config);
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration
    });

    if (!token || token === localToken) return;

    commit(upsertPushSubscription(db, customer, token));
    markPushEnabledOnDevice(customer.id, token);
  } catch {
    // Arka planda sessizce dene
  }
}

// FCM token rotate — native listener ile yeniden kayıt
export function bindNativeTokenRefresh(customer, db, commit) {
  if (!isNativeApp() || !customer?.id || typeof commit !== 'function') {
    return () => {};
  }

  return onNativeTokenRefresh((token) => {
    if (!token) return;
    try {
      commit(upsertPushSubscription(db, customer, token));
      markPushEnabledOnDevice(customer.id, token);
      void syncPushDeviceRegistration(customer, {
        token,
        permissionStatus: 'granted',
        platform: detectPushPlatform()
      });
    } catch {
      // Token kaydı başarısız olsa uygulama çalışmaya devam etsin
    }
  });
}

// Native uygulamada izin verilmişse FCM token kaydını otomatik yap
export async function ensureNativePushRegistered(customer, db, commit) {
  if (!isNativeApp() || !customer?.id || typeof commit !== 'function') return;

  const localToken = getLocalPushToken(customer.id);
  const hasNativeRow = (db.pushSubscriptions || []).some((row) => (
    Number(row.customerId) === Number(customer.id)
    && row.active !== false
    && resolvePushChannel(row) === 'native'
    && (!localToken || row.token === localToken)
  ));

  if (hasNativeRow && localToken) return;

  if (!(await hasNativePushPermission())) return;

  try {
    await enableNativePush(customer, db, commit);
  } catch (error) {
    reportError({
      source: 'push.native.auto-register',
      message: error?.message || 'Native push kaydı başarısız',
      level: 'warn',
      showToast: false,
      persist: true
    });
  }
}

// enablePush sarmalayıcı — hata mesajını döndürür
export async function tryEnablePush(customer, db, commit) {
  try {
    await enablePush(customer, db, commit);
    return { ok: true, message: 'Bildirimler aktif.', needsSettings: false };
  } catch (error) {
    reportError({
      source: 'push.enable',
      message: error?.message || 'Push etkinleştirilemedi',
      level: 'warn',
      showToast: false,
      persist: true
    });

    const message = error?.message || '';
    const needsSettings = isNativeApp() && (
      message.includes('Ayarlar')
      || message.includes('kapalı')
      || message.includes('izni')
      || message.includes('reddedildi')
    );

    if (needsSettings) {
      return { ok: false, message, needsSettings: true };
    }

    return { ok: false, message: mapPushError(error), needsSettings: false };
  }
}
