import { STATUS } from './guardianConstants.js';

// Liberte Guardian — Safe Mode yapılandırması
// Tek sorumluluk: güvenli azaltılmış mod konfigürasyonunu tutmak ve TTL ile
// otomatik yeniden değerlendirmek. v1'de bellek tabanlıdır (lambda ömrü kadar).
// Kalıcı çözüm: scripts/sql/006_guardian.sql (guardian_safe_mode tablosu).
//
// Safe Mode YAPAMAZ: veri silme, LP puanı değişimi, migration, yetki/secret/deploy.
// Yalnızca polling/realtime/refresh davranışını "azaltır" ve kullanıcıya mesaj gösterir.

const DEFAULT_TTL_MINUTES = 60;

// Özellik bayrakları varsayılanı (Safe Mode kapalıyken normal davranış)
function normalFeatures() {
  return {
    realtime: 'normal',
    polling: 'normal',
    adminDashboardRefresh: 'normal',
    fullStatePull: 'enabled',
    dailyClaim: 'enabled',
    qr: 'enabled',
    loyalty: 'enabled',
    push: 'enabled'
  };
}

// Safe Mode açıkken uygulanan azaltılmış özellikler
function degradedFeatures(overrides = {}) {
  return {
    realtime: 'degraded',
    polling: 'reduced',
    adminDashboardRefresh: 'reduced',
    fullStatePull: 'disabled_for_customer',
    dailyClaim: 'disabled_temporarily',
    qr: 'enabled',
    loyalty: 'enabled_with_short_timeout',
    push: 'enabled',
    ...overrides
  };
}

// Kapalı varsayılan konfigürasyon
export function defaultSafeMode() {
  return {
    enabled: false,
    reason: null,
    level: STATUS.HEALTHY,
    startedAt: null,
    expiresAt: null,
    features: normalFeatures()
  };
}

// Bellek deposu (lambda instance ömrü boyunca)
function store() {
  if (!globalThis.__liberteGuardianSafeMode) {
    globalThis.__liberteGuardianSafeMode = defaultSafeMode();
  }
  return globalThis.__liberteGuardianSafeMode;
}

// TTL kontrolü — süresi dolduysa otomatik kapat (yeniden değerlendirme)
function evaluateTtl(config) {
  if (!config.enabled || !config.expiresAt) return config;
  if (Date.now() >= Date.parse(config.expiresAt)) {
    const reset = defaultSafeMode();
    reset.reason = config.reason ? `${config.reason} (TTL doldu, otomatik kapatıldı)` : null;
    globalThis.__liberteGuardianSafeMode = reset;
    return reset;
  }
  return config;
}

// Anlık (senkron) okuma — header ve hızlı kararlar için. TTL değerlendirilir.
export function readSafeModeSync() {
  return evaluateTtl(store());
}

// Header için kısa, güvenli string. PII/secret içermez; yalnızca istemcinin
// davranışını uyarlaması için gereken minimal bayraklar taşınır.
// Biçim: "off" | "on:<level>;poll=<0|1>;fsp=<0|1>;rt=<0|1>"
//  - poll: polling azaltılmış mı (reduced)
//  - fsp : customer full state pull kapalı mı (enabled değil)
//  - rt  : realtime degraded mı
export function safeModeHeaderValue() {
  const config = readSafeModeSync();
  if (!config.enabled) return 'off';
  const f = config.features || {};
  const poll = f.polling === 'reduced' ? 1 : 0;
  const fsp = f.fullStatePull && f.fullStatePull !== 'enabled' ? 1 : 0;
  const rt = f.realtime === 'degraded' ? 1 : 0;
  return `on:${config.level};poll=${poll};fsp=${fsp};rt=${rt}`;
}

// Safe Mode aç — TTL'li
// light=false (varsayılan): tam azaltılmış mod (tüm degraded feature'lar).
// light=true: HAFİF mod — yalnızca verilen feature'lar değişir, gerisi normal kalır.
//   (Level 1 otomatik koruma: yalnızca polling/realtime azalt, fullStatePull/dailyClaim normal kalsın.)
export function enableSafeMode({ reason = 'unspecified', level = STATUS.DEGRADED, ttlMinutes = DEFAULT_TTL_MINUTES, features = {}, light = false } = {}) {
  const now = Date.now();
  // Light modda mevcut aktif azaltmaları koru (birden çok kural çakışmasın), aksi halde normal taban.
  let lightBase = null;
  if (light) {
    const current = readSafeModeSync();
    lightBase = current.enabled ? current.features : normalFeatures();
  }
  const config = {
    enabled: true,
    reason: String(reason).slice(0, 200),
    level,
    startedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + Math.max(1, ttlMinutes) * 60 * 1000).toISOString(),
    features: light ? { ...lightBase, ...features } : degradedFeatures(features)
  };
  globalThis.__liberteGuardianSafeMode = config;
  return config;
}

// Safe Mode kapat
export function disableSafeMode() {
  const config = defaultSafeMode();
  globalThis.__liberteGuardianSafeMode = config;
  return config;
}

// Belirli bir özellik için Safe Mode değerini döndür
export function safeModeFeature(name) {
  return readSafeModeSync().features[name] ?? 'normal';
}

// Test/temizlik
export function resetSafeMode() {
  globalThis.__liberteGuardianSafeMode = undefined;
}
