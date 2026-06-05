importScripts('https://www.gstatic.com/firebasejs/11.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.0.0/firebase-messaging-compat.js');

const GOOGLE_API_HOSTS = [
  'firebaseinstallations.googleapis.com',
  'fcmregistrations.googleapis.com',
  'firebase.googleapis.com'
];

// Service worker içinden Google API isteklerine referrer ekle
self.addEventListener('fetch', (event) => {
  let url;
  try {
    url = new URL(event.request.url);
  } catch {
    return;
  }
  const isGoogleApi = GOOGLE_API_HOSTS.includes(url.hostname) || url.hostname.endsWith('.googleapis.com');
  if (!isGoogleApi) return;

  event.respondWith(fetch(new Request(event.request, {
    referrer: self.location.origin + '/',
    referrerPolicy: 'strict-origin'
  })));
});

firebase.initializeApp({
  "apiKey": "AIzaSyCDWpSpPoEsMirO0Grbpbabaju7QALVERC",
  "authDomain": "liberte-club.firebaseapp.com",
  "projectId": "liberte-club",
  "storageBucket": "liberte-club.firebasestorage.app",
  "messagingSenderId": "605225271131",
  "appId": "1:605225271131:web:d03f217cfd9445a193e47e"
});

const messaging = firebase.messaging();
const PUSH_ICON = 'https://app.liberte.cafe/icon-192.png';
const PUSH_BADGE = 'https://app.liberte.cafe/notification-badge.png';


function formatPushNotification(title, body) {
  const cleanTitle = String(title || '').trim();
  const cleanBody = String(body || '').trim();
  const isAppName = (value) => {
    const normalized = value.toLowerCase();
    return normalized === 'liberte club' || normalized === 'liberte';
  };
  if ((isAppName(cleanTitle) || !cleanTitle) && cleanBody) {
    return { title: cleanBody, body: '' };
  }
  return {
    title: cleanTitle || 'Liberte Club',
    body: cleanBody || 'Yeni bir bildirimin var.'
  };
}

function showLiberteNotification(payload) {
  const data = payload.data || {};
  const formatted = formatPushNotification(
    payload.notification?.title || data.title,
    payload.notification?.body || data.body
  );
  return self.registration.showNotification(formatted.title, {
    body: formatted.body || undefined,
    icon: PUSH_ICON,
    badge: PUSH_BADGE,
    tag: 'liberte-club-push',
    data
  });
}

messaging.onBackgroundMessage((payload) => showLiberteNotification(payload));

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || 'https://app.liberte.cafe';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((item) => item.url && item.url.includes('app.liberte.cafe'));
      if (open) return open.focus();
      return clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
