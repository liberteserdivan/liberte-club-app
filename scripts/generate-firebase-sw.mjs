import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pushNotificationFormatterSource } from '../src/lib/pushNotificationText.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// iOS uyumlu push SW — Firebase messaging SDK kullanılmaz (çakışma ve sessiz push riski)
const sw = `// Liberte Club push service worker (v18 — rich media)
const PUSH_ICON = 'https://app.liberte.cafe/icon-192.png?v=8';
const PUSH_BADGE = 'https://app.liberte.cafe/notification-badge.png';

${pushNotificationFormatterSource()}

function parsePushPayload(event) {
  if (!event.data) {
    return { data: { title: 'Yeni bildirim', body: '', url: 'https://app.liberte.cafe' } };
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
      return { data: { title: text || 'Yeni bildirim', body: '', url: 'https://app.liberte.cafe' } };
    } catch {
      return { data: { title: 'Yeni bildirim', body: '', url: 'https://app.liberte.cafe' } };
    }
  }
}

function showLiberteNotification(payload) {
  const data = payload.data || {};
  const formatted = formatPushNotification(
    payload.notification?.title || data.title,
    payload.notification?.body || data.body
  );
  const icon = data.icon || payload.notification?.icon || PUSH_ICON;
  const image = data.image || payload.notification?.image || '';
  const noticeData = {
    ...data,
    title: formatted.title,
    body: formatted.body,
    icon,
    image,
    url: data.url || 'https://app.liberte.cafe'
  };
  const options = {
    body: formatted.body || undefined,
    icon,
    badge: PUSH_BADGE,
    tag: 'liberte-club-push',
    data: noticeData
  };
  if (image) options.image = image;
  return self.registration.showNotification(formatted.title, options);
}

// iOS — event.waitUntil zorunlu; aksi halde abonelik iptal edilir
self.addEventListener('push', (event) => {
  event.waitUntil(showLiberteNotification(parsePushPayload(event)));
});

self.addEventListener('notificationclick', (event) => {
  event.preventDefault();
  event.notification.close();
  const data = event.notification?.data || {};
  const payload = {
    type: 'liberte-push-open',
    data: {
      ...data,
      title: data.title || event.notification?.title || '',
      body: data.body || event.notification?.body || '',
      route: data.route || 'message',
      openMessage: data.openMessage || '1'
    }
  };
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((item) => item.url && (item.url.includes('app.liberte.cafe') || item.url.includes('localhost')));
      if (open) {
        open.postMessage(payload);
        return open.focus();
      }
      const targetUrl = data.url || 'https://app.liberte.cafe';
      return clients.openWindow(targetUrl).then((client) => {
        if (!client) return null;
        return new Promise((resolve) => {
          setTimeout(() => {
            client.postMessage(payload);
            resolve(client.focus());
          }, 800);
        });
      });
    })
  );
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
`;

writeFileSync(join(root, 'public', 'firebase-messaging-sw.js'), sw, 'utf8');
console.log('firebase-messaging-sw.js güncellendi.');
