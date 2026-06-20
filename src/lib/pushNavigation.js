// Push bildirimi tıklamasında uygulama içi yönlendirme — Safari'ye düşme

const listeners = new Set();

// Sekme değişim dinleyicisi ekle
export function subscribePushNavigation(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// FCM data alanından hedef sekmeyi çıkar
function resolveRouteFromPayload(data = {}) {
  const route = String(data.route || data.tab || '').trim().toLowerCase();
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

// Bildirim tıklamasını uygulama içi sekmeye çevir
export function handlePushOpenPayload(data = {}) {
  const route = resolveRouteFromPayload(data);
  listeners.forEach((listener) => {
    try {
      listener(route);
    } catch {
      // Dinleyici hatası uygulamayı durdurmasın
    }
  });
  return route;
}
