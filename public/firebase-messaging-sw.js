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

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'Liberte Club';
  const body = payload.notification?.body || 'Yeni bir bildirimin var.';
  self.registration.showNotification(title, {
    body,
    icon: '/liberte-logo.png',
    badge: '/liberte-logo.png',
    data: payload.data || {}
  });
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
