// Push bildirimi tıklamasında uygulama içi yönlendirme ve mesaj gösterimi

const routeListeners = new Set();
const messageListeners = new Set();

// Soğuk açılışta dinleyici henüz yokken gelen tıklamayı sakla
let pendingRoute = null;
let pendingMessage = null;

// Sekme değişim dinleyicisi ekle
export function subscribePushNavigation(listener) {
  if (typeof listener !== 'function') return () => {};
  routeListeners.add(listener);
  if (pendingRoute) {
    const route = pendingRoute;
    pendingRoute = null;
    try {
      listener(route);
    } catch {
      // Dinleyici hatası uygulamayı durdurmasın
    }
  }
  return () => routeListeners.delete(listener);
}

// Uygulama içi mesaj dinleyicisi ekle
export function subscribePushMessageOpen(listener) {
  if (typeof listener !== 'function') return () => {};
  messageListeners.add(listener);
  if (pendingMessage) {
    const message = pendingMessage;
    pendingMessage = null;
    try {
      listener(message);
    } catch {
      // Dinleyici hatası uygulamayı durdurmasın
    }
  }
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

// Native FCM olayından düz data üret (title/body notification veya data'da olabilir)
export function extractPushOpenData(actionOrNotification = {}) {
  const notification = actionOrNotification?.notification || null;
  const nestedData = {
    ...(notification?.data || {}),
    ...(actionOrNotification.data || {})
  };

  // Zaten düz payload ise (openMessage, title…) üst alanları da birleştir
  const looksFlat = !notification
    && !actionOrNotification.data
    && (actionOrNotification.title || actionOrNotification.body || actionOrNotification.openMessage || actionOrNotification.route);
  const data = looksFlat
    ? { ...actionOrNotification, ...nestedData }
    : { ...nestedData };

  // Android/iOS bazen başlığı yalnızca notification katmanında taşır
  if (!data.title && notification?.title) data.title = notification.title;
  if (!data.body && notification?.body) data.body = notification.body;
  if (!data.title && actionOrNotification.title) data.title = actionOrNotification.title;
  if (!data.body && actionOrNotification.body) data.body = actionOrNotification.body;

  // Görsel URL — data veya notification katmanından
  if (!data.imageUrl && notification?.imageUrl) data.imageUrl = notification.imageUrl;
  if (!data.image && notification?.image) data.image = notification.image;
  if (!data.imageUrl && actionOrNotification.imageUrl) data.imageUrl = actionOrNotification.imageUrl;
  if (!data.image && actionOrNotification.image) data.image = actionOrNotification.image;

  return data;
}

// HTTPS görsel URL'sini payload alanlarından seç
function resolvePushImageUrl(data = {}) {
  const candidates = [
    data.imageUrl,
    data.image,
    data.image_url,
    data.payload?.imageUrl,
    data.payload?.image
  ];
  for (const candidate of candidates) {
    const url = String(candidate || '').trim();
    if (/^https:\/\//i.test(url)) return url;
  }
  return '';
}

// Push verisinden okunabilir mesaj nesnesi üret
export function normalizePushMessage(data = {}) {
  const title = String(data.title || '').trim();
  const body = String(data.body || '').trim();
  if (!title && !body) return null;

  const imageUrl = resolvePushImageUrl(data);

  return {
    id: data.messageId || data.id || null,
    title: title || 'Liberte Club',
    body,
    audience: data.audience || null,
    imageUrl: imageUrl || null,
    createdAt: data.createdAt || new Date().toISOString()
  };
}

// Mesaj dinleyicilerine ilet — yoksa beklemeye al
function emitPushMessage(payload) {
  if (!payload) return;
  if (messageListeners.size === 0) {
    pendingMessage = payload;
    return;
  }
  messageListeners.forEach((listener) => {
    try {
      listener(payload);
    } catch {
      // Dinleyici hatası uygulamayı durdurmasın
    }
  });
}

// Sekme dinleyicilerine ilet — yoksa beklemeye al
function emitPushRoute(tab) {
  if (routeListeners.size === 0) {
    pendingRoute = tab;
    return;
  }
  routeListeners.forEach((listener) => {
    try {
      listener(tab);
    } catch {
      // Dinleyici hatası uygulamayı durdurmasın
    }
  });
}

// Bildirim tıklamasını uygulama içi sekmeye ve mesaj ekranına çevir
export function handlePushOpenPayload(raw = {}) {
  const data = extractPushOpenData(raw);
  const message = normalizePushMessage(data);
  const wantsMessage = Boolean(message)
    || data.openMessage === '1'
    || String(data.route || '').toLowerCase() === 'message';

  if (wantsMessage) {
    const payload = message || {
      id: data.messageId || data.id || null,
      title: 'Liberte Club',
      body: 'Yeni bir bildirimin var.',
      audience: data.audience || null,
      imageUrl: resolvePushImageUrl(data) || null,
      createdAt: data.createdAt || new Date().toISOString()
    };
    emitPushMessage(payload);
  }

  const route = wantsMessage ? 'campaign' : resolveRouteFromPayload(data);
  const allowed = new Set(['home', 'menu', 'qr', 'campaign', 'profile', 'admin']);
  const tab = allowed.has(route) ? route : 'home';
  emitPushRoute(tab);

  return { route: tab, message: wantsMessage ? (message || normalizePushMessage(data)) : null };
}
