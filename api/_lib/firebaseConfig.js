// Firebase web config varsayılanları
export const defaultFirebaseConfig = {
  apiKey: 'AIzaSyCDWpSpPoEsMirO0Grbpbabaju7QALVERC',
  authDomain: 'liberte-club.firebaseapp.com',
  projectId: 'liberte-club',
  storageBucket: 'liberte-club.firebasestorage.app',
  messagingSenderId: '605225271131',
  appId: '1:605225271131:web:d03f217cfd9445a193e47e',
  measurementId: 'G-HRKRV78XGS'
};

// Ortam değişkeninden oku, boşsa varsayılanı kullan
function pickEnv(name, fallback) {
  const value = String(process.env[name] || '').trim();
  return value || fallback;
}

// Sunucu tarafı Firebase web config
export function readFirebaseWebConfig() {
  return {
    apiKey: pickEnv('FIREBASE_WEB_API_KEY', pickEnv('VITE_FIREBASE_API_KEY', defaultFirebaseConfig.apiKey)),
    authDomain: pickEnv('FIREBASE_WEB_AUTH_DOMAIN', pickEnv('VITE_FIREBASE_AUTH_DOMAIN', defaultFirebaseConfig.authDomain)),
    projectId: pickEnv('FIREBASE_WEB_PROJECT_ID', pickEnv('VITE_FIREBASE_PROJECT_ID', defaultFirebaseConfig.projectId)),
    storageBucket: pickEnv('FIREBASE_WEB_STORAGE_BUCKET', pickEnv('VITE_FIREBASE_STORAGE_BUCKET', defaultFirebaseConfig.storageBucket)),
    messagingSenderId: pickEnv('FIREBASE_WEB_MESSAGING_SENDER_ID', pickEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', defaultFirebaseConfig.messagingSenderId)),
    appId: pickEnv('FIREBASE_WEB_APP_ID', pickEnv('VITE_FIREBASE_APP_ID', defaultFirebaseConfig.appId)),
    measurementId: pickEnv('FIREBASE_WEB_MEASUREMENT_ID', pickEnv('VITE_FIREBASE_MEASUREMENT_ID', defaultFirebaseConfig.measurementId))
  };
}

// Service worker JS içeriğini üret
export function buildFirebaseMessagingSw(config) {
  return `importScripts('https://www.gstatic.com/firebasejs/11.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.0.0/firebase-messaging-compat.js');

const GOOGLE_API_HOSTS = [
  'firebaseinstallations.googleapis.com',
  'fcmregistrations.googleapis.com',
  'firebase.googleapis.com'
];

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
}
