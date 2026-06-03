importScripts('https://www.gstatic.com/firebasejs/11.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCDWpSpPoEsMirO0Grbpbabaju7QALVERC',
  authDomain: 'liberte-club.firebaseapp.com',
  projectId: 'liberte-club',
  storageBucket: 'liberte-club.firebasestorage.app',
  messagingSenderId: '605225271131',
  appId: '1:605225271131:web:d03f217cfd9445a193e47e'
});

const messaging = firebase.messaging();

// Uygulama kapalıyken gelen push bildirimlerini göster
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'Liberte Club';
  const body = payload.notification?.body || 'Yeni bir bildirimin var.';
  self.registration.showNotification(title, {
    body,
    icon: '/icon.svg',
    badge: '/icon.svg',
    data: payload.data || {}
  });
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
