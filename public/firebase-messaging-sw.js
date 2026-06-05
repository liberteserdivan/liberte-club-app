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


function isIosPushClient() {
  return /iPhone|iPad|iPod/i.test(self.navigator?.userAgent || '');
}

function shouldDeferToSystemNotification(payload) {
  return isIosPushClient() && Boolean(payload?.notification?.title);
}

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

// iOS: sistem bildirimi varsa tekrar gösterme — Android'de her zaman SW göstersin
messaging.onBackgroundMessage((payload) => {
  if (shouldDeferToSystemNotification(payload)) return Promise.resolve();
  return showLiberteNotification(payload);
});

// Kapalı uygulama yedek dinleyicisi
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = null;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  if (shouldDeferToSystemNotification(payload)) return;

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
