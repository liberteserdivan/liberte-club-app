import { apiFetch } from './apiClient.js';

// Sunucu ısınması — Vercel soğuk başlatmasını kullanıcıdan gizler.
// /api/health çağrısı config.js lambda'sını uyandırır; o da kendi içinde
// auth, realtime, qr ve push lambda'larını ısıtır (fan-out). Böylece uygulama
// açılır açılmaz (giriş ekranı görünürken) arka planda tüm fonksiyonlar uyanır;
// kullanıcı giriş yaptığında veya QR açtığında soğuk başlatma gecikmesi olmaz.

// Aynı kısa pencerede tekrar tekrar ısınma isteği atmayı engelle
const WARM_MIN_INTERVAL_MS = 45_000;
let lastWarmAt = 0;

// Sunucuyu ısıt — ateşle ve unut (UI'ı asla bloklamaz, hata yutulur)
export function warmServer({ force = false } = {}) {
  const now = Date.now();
  // Çok sık çağrıda gereksiz istek atma (açılış + resume üst üste gelebilir)
  if (!force && now - lastWarmAt < WARM_MIN_INTERVAL_MS) return;
  lastWarmAt = now;

  apiFetch('/api/health', {
    method: 'GET',
    retryTransient: false,
    skipUnauthorized: true,
    timeoutMs: 8000
  }).catch(() => {
    // Isınma başarısız olsa bile sessiz geç — gerçek istek kendi hatasını yönetir
  });
}
