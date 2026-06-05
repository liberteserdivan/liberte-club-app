import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pushNotificationFormatterSource } from '../src/lib/pushNotificationText.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const defaults = {
  apiKey: 'AIzaSyCDWpSpPoEsMirO0Grbpbabaju7QALVERC',
  authDomain: 'liberte-club.firebaseapp.com',
  projectId: 'liberte-club',
  storageBucket: 'liberte-club.firebasestorage.app',
  messagingSenderId: '605225271131',
  appId: '1:605225271131:web:d03f217cfd9445a193e47e'
};

// Ortam değişkeni doluysa kullan
function pick(name, fallback) {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

const config = {
  apiKey: pick('FIREBASE_WEB_API_KEY', pick('VITE_FIREBASE_API_KEY', defaults.apiKey)),
  authDomain: pick('FIREBASE_WEB_AUTH_DOMAIN', pick('VITE_FIREBASE_AUTH_DOMAIN', defaults.authDomain)),
  projectId: pick('FIREBASE_WEB_PROJECT_ID', pick('VITE_FIREBASE_PROJECT_ID', defaults.projectId)),
  storageBucket: pick('FIREBASE_WEB_STORAGE_BUCKET', pick('VITE_FIREBASE_STORAGE_BUCKET', defaults.storageBucket)),
  messagingSenderId: pick('FIREBASE_WEB_MESSAGING_SENDER_ID', pick('VITE_FIREBASE_MESSAGING_SENDER_ID', defaults.messagingSenderId)),
  appId: pick('FIREBASE_WEB_APP_ID', pick('VITE_FIREBASE_APP_ID', defaults.appId))
};

const sw = `importScripts('https://www.gstatic.com/firebasejs/11.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.0.0/firebase-messaging-compat.js');

// Yalnızca Installations GET isteklerine referrer ekle — POST push kaydını bozma
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  let url;
  try {
    url = new URL(event.request.url);
  } catch {
    return;
  }
  if (url.hostname !== 'firebaseinstallations.googleapis.com') return;

  event.respondWith(fetch(new Request(event.request, {
    referrer: self.location.origin + '/',
    referrerPolicy: 'strict-origin'
  })));
});

firebase.initializeApp(${JSON.stringify(config, null, 2)});

const messaging = firebase.messaging();
const PUSH_ICON = 'https://app.liberte.cafe/icon-192.png';
const PUSH_BADGE = 'https://app.liberte.cafe/notification-badge.png';

${pushNotificationFormatterSource()}

function showLiberteNotification(payload) {
  const data = payload.data || {};
  const formatted = formatPushNotification(
    payload.notification?.title || data.title,
    payload.notification?.body || data.body
  );
  const noticeData = {
    ...data,
    title: formatted.title,
    body: formatted.body,
    url: data.url || 'https://app.liberte.cafe'
  };
  return self.registration.showNotification(formatted.title, {
    body: formatted.body || undefined,
    icon: PUSH_ICON,
    badge: PUSH_BADGE,
    tag: 'liberte-club-push',
    data: noticeData
  });
}

// Arka plan — iOS'ta onBackgroundMessage sınırlı; yine de göster
messaging.onBackgroundMessage((payload) => showLiberteNotification(payload));

// iOS kapalı/arka plan — asıl teslimat push olayı ile
self.addEventListener('push', (event) => {
  let payload = { data: {} };

  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      try {
        const text = event.data.text();
        payload = { data: { title: text || 'Yeni bildirim', body: '' } };
      } catch {
        payload = { data: { title: 'Yeni bildirim', body: '' } };
      }
    }
  }

  event.waitUntil(showLiberteNotification({
    notification: payload.notification,
    data: payload.data || payload
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.preventDefault();
  event.notification.close();
  const targetUrl = event.notification?.data?.url || 'https://app.liberte.cafe';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((item) => item.url && item.url.includes('app.liberte.cafe'));
      if (open) {
        open.navigate(targetUrl);
        return open.focus();
      }
      return clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
`;

writeFileSync(join(root, 'public', 'firebase-messaging-sw.js'), sw, 'utf8');
console.log('firebase-messaging-sw.js güncellendi.');
