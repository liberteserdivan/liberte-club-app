import { firebaseConfig as defaultConfig } from './constants.js';

// Ortam değişkeni varsa kullan, boş string ile varsayılanı ezme
function envOrDefault(key, fallback) {
  const value = import.meta.env[key];
  if (typeof value === 'string' && value.trim()) return value.trim();
  return fallback;
}

// Firebase web yapılandırmasını döndür
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

// Web push VAPID anahtarını döndür
export function getVapidKey() {
  return envOrDefault('VITE_FIREBASE_VAPID_KEY', '');
}

// Push hata mesajını kullanıcı dostu metne çevir
function mapPushError(error) {
  const message = error?.message || String(error || '');

  if (error?.message === 'VAPID_MISSING' || !getVapidKey()) {
    return 'Push yapılandırması eksik. Vercel\'de VITE_FIREBASE_VAPID_KEY tanımlanmalı.';
  }

  if (message.includes('API key not valid') || message.includes('INVALID_ARGUMENT')) {
    return 'Firebase API anahtarı reddedildi. Google Cloud Console\'da API key kısıtlamalarına https://app.liberte.cafe/* ve https://*.vercel.app/* ekleyin.';
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
  const { initializeApp, getApps } = await import('firebase/app');
  const { getMessaging, getToken, isSupported, onMessage } = await import('firebase/messaging');

  if (!('Notification' in window)) {
    throw new Error('Bu cihaz bildirim desteklemiyor.');
  }

  const supported = await isSupported();
  if (!supported) {
    throw new Error('Bu tarayıcı web push desteklemiyor.');
  }

  const vapidKey = getVapidKey();
  if (!vapidKey) {
    throw new Error('VAPID_MISSING');
  }

  let permission = Notification.permission;
  if (permission !== 'granted') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') {
    throw new Error('Bildirim izni verilmedi.');
  }

  const config = getFirebaseConfig();
  if (!config.apiKey) {
    throw new Error('Firebase API anahtarı bulunamadı.');
  }

  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  await navigator.serviceWorker.ready;

  const app = getApps().length ? getApps()[0] : initializeApp(config);
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

  onMessage(messaging, (payload) => {
    new Notification(payload.notification?.title || 'Liberte Club', {
      body: payload.notification?.body || 'Yeni bildirim',
      icon: '/liberte-logo.png'
    });
  });

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
