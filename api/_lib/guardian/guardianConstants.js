// Liberte Guardian — paylaşılan sabitler
// Tek sorumluluk: durum seviyeleri, servis adları, eşik değerleri ve mesajlar.
// Hiçbir yan etki içermez; hem server hem (kopyalanan) client mantığı buradan beslenir.

// Genel sağlık seviyeleri (artan ciddiyet sırası)
export const STATUS = Object.freeze({
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  INCIDENT: 'incident',
  CRITICAL: 'critical'
});

// Seviye sıralaması — en kötü durumu seçmek için kullanılır
export const STATUS_RANK = Object.freeze({
  healthy: 0,
  degraded: 1,
  incident: 2,
  critical: 3
});

// İzlenen servis/alan adları
export const SERVICE = Object.freeze({
  DB: 'db',
  AUTH: 'auth',
  LOGIN: 'login',
  QR: 'qr',
  LOYALTY: 'loyalty',
  REALTIME: 'realtime',
  API: 'api',
  CONFIG: 'config',
  PUSH: 'push',
  STORAGE: 'storage'
});

// Eşik değerleri (ms / adet). Otomatik aksiyon kuralları (bölüm 7) bunları kullanır.
export const THRESHOLDS = Object.freeze({
  DB_PING_DEGRADED_MS: 1500,
  DB_PING_CRITICAL_MS: 3000,
  // DB ping kısa tutulur — guardian health hiçbir zaman Vercel 504'üne (90sn) düşmemeli
  DB_HEALTH_TIMEOUT_MS: 2500,
  AUTH_SESSION_SLOW_MS: 4000,
  LOGIN_SLOW_MS: 8000,
  PUSH_SLOW_MS: 5000,
  ADMIN_MEMBERS_SLOW_MS: 8000,
  LP_SLOW_MS: 10000,
  QR_SLOW_MS: 5000,
  // p95 latency degraded eşiği — genel API
  API_P95_DEGRADED_MS: 4000,
  // Hata oranı (0-1) degraded eşiği
  API_ERROR_RATE_DEGRADED: 0.2,
  // Üst üste yavaş ölçüm sayısı (kural tetikleyici)
  CONSECUTIVE_SLOW_FOR_ACTION: 3,
  // 5 dk penceresinde timeout/critical sayısı
  WINDOW_MS: 5 * 60 * 1000,
  WINDOW_TIMEOUT_COUNT: 5
});

// Standart hata kodları — kullanıcıya gösterilmez, admin/rapor tarafında kullanılır
export const ERROR_CODE = Object.freeze({
  DB_TIMEOUT: 'DB_TIMEOUT',
  DB_UNREACHABLE: 'DB_UNREACHABLE',
  AUTH_FAILED: 'AUTH_FAILED',
  QR_SIGNING_MISSING: 'QR_SIGNING_MISSING',
  CONFIG_INVALID: 'CONFIG_INVALID',
  UNKNOWN: 'UNKNOWN'
});

// Kullanıcıya gösterilecek nazik mesajlar (teknik detay yok — bölüm 10)
export const USER_MESSAGE = Object.freeze({
  DB_SLOW: 'Sistem yoğunluğu nedeniyle işlem biraz uzun sürebilir. Lütfen tekrar tekrar basmayın.',
  LP_PROCESSING: 'LP işlemi güvenli şekilde işleniyor. Lütfen sonucu bekleyin.',
  QR_SLOW: 'QR oluşturuluyor. Bağlantı yavaşsa birkaç saniye sürebilir.',
  SERVER_ERROR: 'Sunucuya bağlanırken sorun yaşandı. Tekrar deneyin.',
  SAFE_MODE: 'Sistem yoğunluğu nedeniyle bazı arka plan güncellemeleri geçici olarak yavaşlatıldı.'
});

// Incident seviyesini rapor başlığı (Critical/High/Medium/Low) ile eşle
export const REPORT_SEVERITY = Object.freeze({
  critical: 'Critical',
  incident: 'High',
  degraded: 'Medium',
  healthy: 'Low'
});

// Verilen seviyelerden en kötüsünü döndür
export function worstStatus(...statuses) {
  let worst = STATUS.HEALTHY;
  for (const status of statuses) {
    if (!status) continue;
    if ((STATUS_RANK[status] ?? 0) > (STATUS_RANK[worst] ?? 0)) worst = status;
  }
  return worst;
}

// requiresHuman — incident veya critical ise insan müdahalesi gerekir
export function statusRequiresHuman(status) {
  return status === STATUS.INCIDENT || status === STATUS.CRITICAL;
}
