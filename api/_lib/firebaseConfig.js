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

// NOT: Kullanılan service worker, scripts/generate-firebase-sw.mjs tarafından
// public/firebase-messaging-sw.js olarak üretilir. Buradaki ikinci (compat tabanlı)
// SW üreticisi hiçbir yerde kullanılmadığı için kaldırıldı (bakım/kafa karışıklığı).
