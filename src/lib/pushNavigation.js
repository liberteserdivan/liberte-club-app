// Push bildirimi tıklamasında uygulama içi yönlendirme ve mesaj gösterimi

const routeListeners = new Set();
const messageListeners = new Set();

// Sekme değişim dinleyicisi ekle
export function subscribePushNavigation(listener) {
  if (typeof listener !== 'function') return () => {};
  routeListeners.add(listener);
  return () => routeListeners.delete(listener);
}

// Uygulama içi mesaj dinleyicisi ekle
export function subscribePushMessageOpen(listener) {
  if (typeof listener !== 'function') return () => {};
  messageListeners.add(listener);
  return () => messageListeners.delete(listener);
}

// FCM data alanından hedef sekmeyi çıkar
function resolveRouteFromPayload(data = {}) {
  const route = String(data.route || data.tab || '').trim().toLowerCase();
  if (route === 'message') return 'campaign';
  if (route) return route.replace(/^\//, '') || 'home';

  const path = String(data.path || '').trim();
  if (path) return path.replace(/^\//, '') || 'home';

  const url = String(data.url || data.link || '').trim();
  if (!url) return 'home';

  try {
    const target = new URL(url);
    const segment = target.pathname.replace(/^\//, '').split('/')[0];
    return segment || 'home';
  } catch {
    return 'home';
  }
}

// Push verisinden okunabilir mesaj nesnesi üret
export function normalizePushMessage(data = {}) {
  const title = String(data.title || '').trim();
  const body = String(data.body || '').trim();
  if (!title && !body) return null;

  return {
    id: data.messageId || data.id || null,
    title: title || 'Liberte Club',
    body,
    audience: data.audience || null,
    createdAt: data.createdAt || null
  };
}

// Bildirim tıklamasını uygulama içi sekmeye ve mesaj ekranına çevir
export function handlePushOpenPayload(data = {}) {
  const message = normalizePushMessage(data);
  const wantsMessage = Boolean(message)
    || data.openMessage === '1'
    || String(data.route || '').toLowerCase() === 'message';

  if (wantsMessage) {
    const payload = message || {
      id: data.messageId || data.id || null,
      title: 'Liberte Club',
      body: '',
      audience: data.audience || null,
      createdAt: data.createdAt || null
    };
    messageListeners.forEach((listener) => {
      try {
        listener(payload);
      } catch {
        // Dinleyici hatası uygulamayı durdurmasın
      }
    });
  }

  const route = wantsMessage ? 'campaign' : resolveRouteFromPayload(data);
  const allowed = new Set(['home', 'menu', 'qr', 'campaign', 'profile', 'admin']);
  const tab = allowed.has(route) ? route : 'home';

  routeListeners.forEach((listener) => {
    try {
      listener(tab);
    } catch {
      // Dinleyici hatası uygulamayı durdurmasın
    }
  });

  return { route: tab, message: wantsMessage ? (message || normalizePushMessage(data)) : null };
}
