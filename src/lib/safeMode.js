// Liberte Guardian — istemci tarafı Safe Mode durumu
// Tek sorumluluk: sunucudan gelen Safe Mode bilgisini bellekte tutmak ve
// polling/realtime/refresh davranışını uyarlayan getter'lar sunmak.
// Kaynak: API yanıtlarındaki "x-safe-mode" header'ı + /api/guardian/safe-mode.

const listeners = new Set();

let state = {
  enabled: false,
  level: 'healthy',
  features: {},
  maintenanceMessage: ''
};

// Header değerinden hızlı güncelleme. Sunucu biçimi:
//   "off" | "on:<level>;poll=<0|1>;fsp=<0|1>;rt=<0|1>;dc=<0|1>;adm=<0|1>[;m=<msg>]"
export function applySafeModeHeader(headerValue) {
  const raw = String(headerValue || '').trim();
  const enabled = raw.toLowerCase().startsWith('on');

  if (!enabled) {
    if (state.enabled || state.maintenanceMessage) {
      state = { enabled: false, level: 'healthy', features: {}, maintenanceMessage: '' };
      notify();
    }
    return;
  }

  const [head, ...flagParts] = raw.split(';');
  const level = (head.split(':')[1] || 'degraded').toLowerCase();
  const flags = {};
  for (const part of flagParts) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const key = part.slice(0, eq).toLowerCase();
    // Bakım mesajı ham bırakılır; diğer bayraklar küçük harfe normalize edilir
    flags[key] = key === 'm' ? part.slice(eq + 1) : part.slice(eq + 1).toLowerCase();
  }

  let maintenanceMessage = '';
  if (flags.m) {
    try { maintenanceMessage = decodeURIComponent(flags.m); } catch { maintenanceMessage = flags.m; }
  }

  const features = {
    polling: flags.poll === '1' ? 'reduced' : 'normal',
    fullStatePull: flags.fsp === '1' ? 'disabled_for_customer' : 'enabled',
    realtime: flags.rt === '1' ? 'degraded' : 'normal',
    dailyClaim: flags.dc === '1' ? 'disabled_temporarily' : 'enabled',
    adminDashboardRefresh: flags.adm === '1' ? 'reduced' : 'normal'
  };

  const next = { enabled: true, level, features, maintenanceMessage };
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
    features: config.features || {},
    maintenanceMessage: String(config.maintenanceMessage || '').slice(0, 120)
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

// Günlük LP claim geçici kapalı mı?
export function shouldDisableDailyClaim() {
  return state.enabled && state.features?.dailyClaim === 'disabled_temporarily';
}

// Admin dashboard özet yenilemesi seyrekleştirilmeli mi?
export function shouldReduceAdminDashboardRefresh() {
  return state.enabled && state.features?.adminDashboardRefresh === 'reduced';
}

// Bakım mesajı (varsa kullanıcıya gösterilir)
export function getMaintenanceMessage() {
  return String(state.maintenanceMessage || '').trim();
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
  if (!state.enabled && !state.maintenanceMessage) return;
  state = { enabled: false, level: 'healthy', features: {}, maintenanceMessage: '' };
  notify();
}

// Test/temizlik — dinleyiciler dahil her şeyi sıfırlar
export function resetSafeModeClient() {
  state = { enabled: false, level: 'healthy', features: {}, maintenanceMessage: '' };
  listeners.clear();
}
