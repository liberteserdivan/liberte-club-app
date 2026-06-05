importScripts('https://www.gstatic.com/firebasejs/11.0.0/firebase-app-compat.js');
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


const IOS_TITLE_MAX = 30;

function isAppName(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'liberte club' || normalized === 'liberte';
}

function truncateIosTitle(title) {
  const clean = String(title || '').trim();
  if (clean.length <= IOS_TITLE_MAX) return clean;
  return clean.slice(0, IOS_TITLE_MAX - 1) + '…';
}

function formatPushNotification(title, body) {
  const cleanTitle = String(title || '').trim();
  const cleanBody = String(body || '').trim();
  let finalTitle = cleanTitle;
  let finalBody = cleanBody;

  if ((isAppName(cleanTitle) || !cleanTitle) && cleanBody) {
    finalTitle = cleanBody;
    finalBody = '';
  } else if (cleanTitle && cleanBody && cleanTitle !== cleanBody) {
    finalTitle = cleanTitle;
    finalBody = cleanBody;
  } else if (cleanTitle && !cleanBody) {
    finalTitle = cleanTitle;
    finalBody = '';
  } else if (!cleanTitle && cleanBody) {
    finalTitle = cleanBody;
    finalBody = '';
  } else {
    finalTitle = 'Yeni bildirim';
    finalBody = '';
  }

  if (finalTitle.length > IOS_TITLE_MAX && finalBody) {
    finalTitle = truncateIosTitle(finalTitle);
  } else if (finalTitle.length > IOS_TITLE_MAX) {
    finalBody = finalTitle;
    finalTitle = truncateIosTitle(finalTitle);
  } else {
    finalTitle = truncateIosTitle(finalTitle);
  }

  return { title: finalTitle, body: finalBody };
}

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
