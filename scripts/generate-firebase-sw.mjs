import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pushNotificationFormatterSource } from '../src/lib/pushNotificationText.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const siteOrigin = String(
  process.env.PUBLIC_SITE_ORIGIN
  || process.env.VITE_PUBLIC_SITE_ORIGIN
  || 'https://app.liberte.cafe'
).replace(/\/$/, '');
const siteHost = new URL(siteOrigin).hostname;

// iOS uyumlu push SW — Firebase messaging SDK kullanılmaz (çakışma ve sessiz push riski)
const sw = `// Liberte Club push service worker (v18)
const SITE_ORIGIN = '${siteOrigin}';
const SITE_HOST = '${siteHost}';
const PUSH_ICON = SITE_ORIGIN + '/icon-192.png?v=8';
const PUSH_BADGE = SITE_ORIGIN + '/notification-badge.png';

${pushNotificationFormatterSource()}

function parsePushPayload(event) {
  if (!event.data) {
    return { data: { title: 'Yeni bildirim', body: '', url: SITE_ORIGIN } };
  }

  try {
    const json = event.data.json();
    return {
      notification: json.notification,
      data: json.data || json
    };
  } catch {
    try {
      const text = event.data.text();
      return { data: { title: text || 'Yeni bildirim', body: '', url: SITE_ORIGIN } };
    } catch {
      return { data: { title: 'Yeni bildirim', body: '', url: SITE_ORIGIN } };
    }
  }
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
    url: data.url || SITE_ORIGIN
  };
  return self.registration.showNotification(formatted.title, {
    body: formatted.body || undefined,
    icon: PUSH_ICON,
    badge: PUSH_BADGE,
    tag: 'liberte-club-push',
    data: noticeData
  });
}

// iOS — event.waitUntil zorunlu; aksi halde abonelik iptal edilir
self.addEventListener('push', (event) => {
  event.waitUntil(showLiberteNotification(parsePushPayload(event)));
});

self.addEventListener('notificationclick', (event) => {
  event.preventDefault();
  event.notification.close();
  const targetUrl = event.notification?.data?.url || SITE_ORIGIN;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((item) => {
        if (!item.url) return false;
        return item.url.includes(SITE_HOST) || item.url.includes('localhost');
      });
      if (open) {
        if (typeof open.navigate === 'function') {
          open.navigate(targetUrl);
        }
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
