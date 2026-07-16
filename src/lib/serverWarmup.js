import { apiFetch } from './apiClient.js';

// Sunucu ısınması — Vercel soğuk başlatmasını kullanıcıdan gizler.
// /api/health yalnızca config lambda'sını uyandırır (DB ping / fan-out YOK).
// DB warm: auth ve state lambda'larını SIRAYLA uyandırır — aynı anda iki
// bağlantı açılıp pooler'ı boğmamak için paralel değil seri çağrılır.

const WARM_MIN_INTERVAL_MS = 45_000;
const DB_WARM_MIN_INTERVAL_MS = 30_000;
let lastWarmAt = 0;
let lastDbWarmAt = 0;
let dbWarmInFlight = null;

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

// Sunucuyu ısıt — ateşle ve unut (UI'ı asla bloklamaz, hata yutulur)
export function warmServer({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastWarmAt < WARM_MIN_INTERVAL_MS) return;
  lastWarmAt = now;

  apiFetch('/api/health', {
    method: 'GET',
    retryTransient: false,
    skipUnauthorized: true,
    timeoutMs: 8000
  }).catch(() => {});
}

// Kritik DB lambda'larını sırayla ısıt — login/state öncesi bağlantı hazır olsun
export function warmDatabasePool({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastDbWarmAt < DB_WARM_MIN_INTERVAL_MS) return;
  if (dbWarmInFlight) return;

  lastDbWarmAt = now;
  dbWarmInFlight = (async () => {
    try {
      await apiFetch('/api/auth?action=warm', {
        method: 'GET',
        retryTransient: false,
        skipUnauthorized: true,
        timeoutMs: 8000
      }).catch(() => {});
      await sleep(350);
      await apiFetch('/api/state?warm=1', {
        method: 'GET',
        retryTransient: false,
        skipUnauthorized: true,
        timeoutMs: 8000
      }).catch(() => {});
    } finally {
      dbWarmInFlight = null;
    }
  })();
}
