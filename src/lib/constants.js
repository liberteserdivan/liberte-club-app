export const firebaseConfig = {
  apiKey: 'AIzaSyCDWpSpPoEsMirO0Grbpbabaju7QALVERC',
  authDomain: 'liberte-club.firebaseapp.com',
  projectId: 'liberte-club',
  storageBucket: 'liberte-club.firebasestorage.app',
  messagingSenderId: '605225271131',
  appId: '1:605225271131:web:d03f217cfd9445a193e47e',
  measurementId: 'G-HRKRV78XGS'
};

// Web Push VAPID public key — Firebase Console → Cloud Messaging → Web Push
// Vercel'de FIREBASE_VAPID_PUBLIC_KEY olarak da tanımlanabilir
export const firebaseVapidKey = '';

export const googleReviewUrl = 'https://g.page/r/CY8uWX2mwBgIEBM/review';
export const instagramUrl = 'https://www.instagram.com/gastroliberte';
export const yemeksepetiUrl = 'https://www.yemeksepeti.com/restaurant/x9yt/liberte-gastro-cafe';
export const mapsUrl = 'https://www.google.com/maps/search/?api=1&query=Liberte+Gastro+Cafe+Serdivan+Sakarya';
export const phoneUrl = 'tel:+905058665406';
export const supportEmail = 'liberteserdivan@gmail.com';
export const privacyPolicyUrl = 'https://app.liberte.cafe/gizlilik';
export const termsUrl = 'https://app.liberte.cafe/kullanim-sartlari';

// Varsayılan marka logosu (public klasörü)
export const DEFAULT_LOGO = '/liberte-logo.png?v=10';

// Push bildirim görselleri — badge liberte-logo silueti
export const NOTIFICATION_ICON = '/icon-192.png?v=10';
export const NOTIFICATION_BADGE = '/notification-badge.png';

// Sadakat halkası statik bardak görseli (şeffaf PNG)
export const CUP_STATIC_IMAGE = '/liberte-cup.png?v=2';

// Luwai logo bardak GLB — optimize edilmiş (isteğe bağlı)
export const CUP_MODEL = '/Liberte_Cup_Luwai_App.glb?v=2';

// Şimdilik statik görsel — 3D kapalı
export const CUP_USE_3D = false;

// Bardak dönme animasyonu — kapalı
export const CUP_SPIN_ENABLED = false;
