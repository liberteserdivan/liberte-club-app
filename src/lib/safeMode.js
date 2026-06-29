// Liberte Guardian — istemci tarafı Safe Mode durumu
// Tek sorumluluk: sunucudan gelen Safe Mode bilgisini bellekte tutmak ve
// polling/realtime/refresh davranışını uyarlayan getter'lar sunmak.
// Kaynak: API yanıtlarındaki "x-safe-mode" header'ı + /api/guardian/safe-mode.

const listeners = new Set();

let state = {
  enabled: false,
  level: 'healthy',
  features: {}
};

// Header değerinden hızlı güncelleme. Sunucu biçimi:
//   "off" | "on:<level>;poll=<0|1>;fsp=<0|1>;rt=<0|1>"
// Bu sayede müşteri istemcileri ek istek yapmadan, yalnızca header'dan
// polling/fullStatePull/realtime davranışını öğrenir (PII/secret yok).
export function applySafeModeHeader(headerValue) {
  const value = String(headerValue || '').trim().toLowerCase();
  const enabled = value.startsWith('on');

  if (!enabled) {
    // Kapalı → normal davranışa dön
    if (state.enabled) {
      state = { enabled: false, level: 'healthy', features: {} };
      notify();
    }
    return;
  }

  // "on:<level>;poll=1;fsp=1;rt=1" parçalarını ayrıştır
  const [head, ...flagParts] = value.split(';');
  const level = head.split(':')[1] || 'degraded';
  const flags = {};
  for (const part of flagParts) {
    const [k, v] = part.split('=');
    if (k) flags[k] = v;
  }

  // Header'dan gelen minimal, güvenli feature haritası
  const features = {
    polling: flags.poll === '1' ? 'reduced' : 'normal',
    fullStatePull: flags.fsp === '1' ? 'disabled_for_customer' : 'enabled',
    realtime: flags.rt === '1' ? 'degraded' : 'normal'
  };

  const next = { enabled: true, level, features };
  // Yalnızca gerçek değişiklikte dinleyicileri tetikle (gereksiz render önlenir)
  if (JSON.stringify(next) !== JSON.stringify(state)) {
    state = next;
    notify();
  }
}

// Tam config (guardian endpoint'inden) ile güncelle
export function applySafeModeConfig(config) {
  if (!config || typeof config !== 'object') return;
  state = {
    enabled: Boolean(config.enabled),
    level: config.level || 'healthy',
    features: config.features || {}
  };
  notify();
}

// Anlık durum
export function getSafeModeState() {
  return state;
}

export function isSafeModeEnabled() {
  return state.enabled;
}

// Belirli bir özelliğin azaltılmış olup olmadığını döndür
export function safeModeFeature(name) {
  return state.features?.[name] || (state.enabled ? 'reduced' : 'normal');
}

// Customer full state pull bu modda kısılmalı mı?
export function shouldReduceFullStatePull() {
  return state.enabled && state.features?.fullStatePull !== 'enabled';
}

// Polling azaltılmalı mı?
export function shouldReducePolling() {
  return state.enabled && state.features?.polling === 'reduced';
}

// Realtime degraded mı?
export function isRealtimeDegraded() {
  return state.enabled && state.features?.realtime === 'degraded';
}

// Production acil kapatma bayrağı — build sırasında VITE_DISABLE_REALTIME=true ise
// TÜM realtime kaynakları kapatılır (customer, admin, admin-customers, loyalty,
// dashboard). Cihazdaki realtime selini tamamen durdurmak için sert anahtar.
export function isRealtimeDisabledByFlag() {
  try {
    return String(import.meta.env?.VITE_DISABLE_REALTIME || '').toLowerCase() === 'true';
  } catch {
    return false;
  }
}

// Müşteri realtime (websocket dinleyici) tamamen kapatılmalı mı?
// Bayrak açıksa veya Safe Mode realtime'ı degraded yaptıysa kapatılır.
export function isCustomerRealtimeDisabled() {
  return isRealtimeDisabledByFlag() || isRealtimeDegraded();
}

// Değişiklik aboneliği (hook'lar için)
export function subscribeSafeMode(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  for (const listener of listeners) {
    try { listener(state); } catch { /* dinleyici hatası yok sayılır */ }
  }
}

// Logout/oturum geçişinde istemci Safe Mode durumunu sıfırla. Dinleyiciler
// KORUNUR (hook'lar abone kalır); yalnızca durum normale döner ve bildirilir.
// Böylece önceki oturumdan kalan "on" durumu yeni oturumun polling/fullStatePull
// davranışını yanlışlıkla kısmaz.
export function clearSafeModeState() {
  if (!state.enabled) return;
  state = { enabled: false, level: 'healthy', features: {} };
  notify();
}

// Test/temizlik — dinleyiciler dahil her şeyi sıfırlar
export function resetSafeModeClient() {
  state = { enabled: false, level: 'healthy', features: {} };
  listeners.clear();
}
