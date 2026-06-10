import { firebaseConfig as defaultConfig, firebaseVapidKey as defaultVapidKey, NOTIFICATION_BADGE, NOTIFICATION_ICON } from './constants.js';
import { patchFirebaseReferrer } from './firebaseReferrerPatch.js';
import { markPushEnabledOnDevice } from './pushPrompt.js';
import { formatPushNotification } from './pushNotificationText.js';
import { isIos, isNativeApp } from './platform.js';
import { ensureAndroidNotificationPermission } from './androidNotificationPermission.js';

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
    const response = await fetch('/api/config?resource=firebase');
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
    const response = await fetch('/api/config?resource=push');
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

  if (error?.message === 'VAPID_MISSING') {
    return 'Push henüz yapılandırılmadı. Vercel ortam değişkenlerine FIREBASE_VAPID_PUBLIC_KEY ekleyin (Firebase → Cloud Messaging → Web Push).';
  }

  if (error?.message === 'VAPID_INVALID') {
    return 'VAPID anahtarı eksik veya hatalı. Firebase\'den public key\'in tamamını kopyalayıp Vercel\'de güncelleyin (~88 karakter, B ile başlar).';
  }

  if (message.includes('applicationServerKey is not valid')) {
    return 'VAPID anahtarı geçersiz veya eksik. Firebase\'den public key\'in tamamını (~88 karakter) Vercel\'de FIREBASE_VAPID_PUBLIC_KEY olarak güncelleyin.';
  }

  if (message.includes('API key not valid') || message.includes('INVALID_ARGUMENT') || message.includes('PERMISSION_DENIED')) {
    return 'Firebase API anahtarı reddedildi. Google Cloud\'da yeni API key oluşturup Vercel\'e FIREBASE_WEB_API_KEY olarak ekleyin (Application: None, API: Don\'t restrict). Chrome\'da deneyin.';
  }

  if (message.includes('installations') || message.includes('request-failed')) {
    return 'Firebase bağlantısı kurulamadı. API key, domain kısıtı ve VAPID ayarlarını kontrol edin.';
  }

  if (
    message.includes('push service error')
    || message.includes('Registration failed')
    || message.includes('token-subscribe-failed')
  ) {
    return 'Push servisi bağlanamadı. Sayfayı yenile, Chrome\'da site ayarlarından bildirim iznini aç ve tekrar dene. Sorun sürerse tarayıcı önbelleğini temizle.';
  }

  if (message.includes('messaging/permission-blocked')) {
    return 'Bildirim izni tarayıcı tarafından engellendi.';
  }

  if (message.includes('Android bildirim izni')) {
    return message;
  }

  return `Bildirim kurulamadı: ${message}`;
}

// Cihaz platformunu kısaca etiketle
function detectPushPlatform() {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'web';
}

// Üye başına tek güncel token tut — eski iOS/Android kayıtlarını temizle
function upsertPushSubscription(db, customer, token) {
  const others = (db.pushSubscriptions || []).filter(
    (row) => row.customerId !== customer.id && row.token !== token
  );

  const existing = (db.pushSubscriptions || []).find((row) => row.token === token);
  const platform = detectPushPlatform();
  const now = new Date().toLocaleString('tr-TR');

  if (existing) {
    return {
      ...db,
      pushSubscriptions: [
        ...others,
        {
          ...existing,
          customerId: customer.id,
          name: customer.name,
          phone: customer.phone,
          platform,
          updatedAt: now
        }
      ]
    };
  }

  return {
    ...db,
    pushSubscriptions: [
      ...others,
      {
        id: Date.now(),
        customerId: customer.id,
        name: customer.name,
        phone: customer.phone,
        token,
        platform,
        createdAt: now,
        updatedAt: now
      }
    ]
  };
}

// Push bildirimlerini etkinleştir
export async function enablePush(customer, db, commit) {
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

  attachForegroundPushListener(messaging, onMessage);

  return token;
}

import { getLocalPushToken } from './pushPrompt.js';

// Kayıtlı üyede token yenile — SW sıfırlamadan, yalnızca bu cihazda
export async function refreshPushTokenIfSubscribed(customer, db, commit) {
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

// enablePush sarmalayıcı — hata mesajını döndürür
export async function tryEnablePush(customer, db, commit) {
  try {
    await enablePush(customer, db, commit);
    return { ok: true, message: 'Bildirimler aktif.' };
  } catch (error) {
    if (error?.message === 'VAPID_MISSING') {
      return { ok: false, message: mapPushError(error) };
    }
    return { ok: false, message: mapPushError(error) };
  }
}
