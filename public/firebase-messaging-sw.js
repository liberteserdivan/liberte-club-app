// Liberte Club push service worker (v17)
const PUSH_ICON = 'https://app.liberte.cafe/icon-192.png?v=8';
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
