import { firebaseConfig as defaultConfig, firebaseVapidKey as defaultVapidKey, NOTIFICATION_BADGE, NOTIFICATION_ICON } from './constants.js';
import { patchFirebaseReferrer } from './firebaseReferrerPatch.js';

// Service worker — cache kırma
export const FIREBASE_SW_URL = '/firebase-messaging-sw.js?v=11';
export const PUSH_SITE_ORIGIN = 'https://app.liberte.cafe';

// Tarayıcı bildirimi göster
export function showPushNotification(payload) {
  if (Notification.permission !== 'granted') return;

  const title = payload?.notification?.title || payload?.data?.title || 'Liberte Club';
  const body = payload?.notification?.body || payload?.data?.body || 'Yeni bildirim';

  new Notification(title, {
    body,
    icon: `${PUSH_SITE_ORIGIN}${NOTIFICATION_ICON}`,
    badge: `${PUSH_SITE_ORIGIN}${NOTIFICATION_BADGE}`,
    tag: 'liberte-club-push',
    data: payload?.data || {}
  });
}

let foregroundListenerAttached = false;

// Uygulama açıkken gelen push mesajlarını dinle
export async function startPushForegroundListener() {
  if (!import.meta.env.PROD) return;
  if (Notification.permission !== 'granted') return;
  if (foregroundListenerAttached) return;

  const { initializeApp, getApps } = await import('firebase/app');
  const { getMessaging, onMessage, isSupported } = await import('firebase/messaging');

  if (!(await isSupported())) return;

  patchFirebaseReferrer();
  const config = await resolveFirebaseConfig();
  const app = getApps().length ? getApps()[0] : initializeApp(config);
  const messaging = getMessaging(app);

  onMessage(messaging, showPushNotification);
  foregroundListenerAttached = true;
}

// Eski firebase SW kayıtlarını temizle
async function resetFirebaseServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    registrations
      .filter((reg) => reg.active?.scriptURL?.includes('firebase-messaging-sw'))
      .map((reg) => reg.unregister())
  );
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
    const response = await fetch('/api/config/firebase');
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
    const response = await fetch('/api/config/push');
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

  if (message.includes('messaging/permission-blocked')) {
    return 'Bildirim izni tarayıcı tarafından engellendi.';
  }

  return `Bildirim kurulamadı: ${message}`;
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
    throw new Error('Bu tarayıcı web push desteklemiyor.');
  }

  const vapidKey = await resolveVapidKey();
  if (!vapidKey) {
    throw new Error('VAPID_MISSING');
  }
  if (!isValidVapidPublicKey(vapidKey)) {
    throw new Error('VAPID_INVALID');
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
  patchFirebaseReferrer();
  await resetFirebaseServiceWorker();

  const registration = await navigator.serviceWorker.register(FIREBASE_SW_URL);
  await registration.update();
  await navigator.serviceWorker.ready;

  const app = initializeApp(config);
  const messaging = getMessaging(app);

  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration
  });

  if (!token) {
    throw new Error('Bildirim tokenı alınamadı.');
  }

  const exists = (db.pushSubscriptions || []).some((row) => row.token === token);
  if (!exists) {
    commit({
      ...db,
      pushSubscriptions: [
        ...(db.pushSubscriptions || []),
        {
          id: Date.now(),
          customerId: customer.id,
          name: customer.name,
          phone: customer.phone,
          token,
          createdAt: new Date().toLocaleString('tr-TR')
        }
      ]
    });
  }

  onMessage(messaging, showPushNotification);
  foregroundListenerAttached = true;

  return token;
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
