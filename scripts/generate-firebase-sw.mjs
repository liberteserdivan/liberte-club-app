import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  apiKey: pick('VITE_FIREBASE_API_KEY', defaults.apiKey),
  authDomain: pick('VITE_FIREBASE_AUTH_DOMAIN', defaults.authDomain),
  projectId: pick('VITE_FIREBASE_PROJECT_ID', defaults.projectId),
  storageBucket: pick('VITE_FIREBASE_STORAGE_BUCKET', defaults.storageBucket),
  messagingSenderId: pick('VITE_FIREBASE_MESSAGING_SENDER_ID', defaults.messagingSenderId),
  appId: pick('VITE_FIREBASE_APP_ID', defaults.appId)
};

const sw = `importScripts('https://www.gstatic.com/firebasejs/11.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.0.0/firebase-messaging-compat.js');

firebase.initializeApp(${JSON.stringify(config, null, 2)});

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
`;

writeFileSync(join(root, 'public', 'firebase-messaging-sw.js'), sw, 'utf8');
console.log('firebase-messaging-sw.js güncellendi.');
