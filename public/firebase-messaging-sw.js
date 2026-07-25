// Liberte Club push service worker (v18 — rich media)
const PUSH_ICON = 'https://app.libertegastrocafe.com/icon-192.png?v=8';
const PUSH_BADGE = 'https://app.libertegastrocafe.com/notification-badge.png';


const PUSH_TITLE_MAX = 65;
const PUSH_BODY_MAX = 500;

function isAppName(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'liberte club' || normalized === 'liberte';
}

function clampText(value, max) {
  const clean = String(value || '').trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, Math.max(0, max - 1)) + '…';
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

  if (finalTitle.length > PUSH_TITLE_MAX && finalBody) {
    finalTitle = clampText(finalTitle, PUSH_TITLE_MAX);
  } else if (finalTitle.length > PUSH_TITLE_MAX) {
    finalBody = finalTitle.slice(PUSH_TITLE_MAX).trim() || finalBody;
    finalTitle = clampText(finalTitle, PUSH_TITLE_MAX);
  }

  return {
    title: clampText(finalTitle, PUSH_TITLE_MAX),
    body: clampText(finalBody, PUSH_BODY_MAX)
  };
}

function parsePushPayload(event) {
  if (!event.data) {
    return { data: { title: 'Yeni bildirim', body: '', url: 'https://app.libertegastrocafe.com' } };
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
      return { data: { title: text || 'Yeni bildirim', body: '', url: 'https://app.libertegastrocafe.com' } };
    } catch {
      return { data: { title: 'Yeni bildirim', body: '', url: 'https://app.libertegastrocafe.com' } };
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
    url: data.url || 'https://app.libertegastrocafe.com'
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
      const open = list.find((item) => item.url && (item.url.includes('app.libertegastrocafe.com') || item.url.includes('localhost')));
      if (open) {
        open.postMessage(payload);
        return open.focus();
      }
      const targetUrl = data.url || 'https://app.libertegastrocafe.com';
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
