# Emergency Production Stabilization Report

Tarih: 2026-06-29
Kapsam: Yalnızca acil stabilite. Yeni özellik, Autopilot/Approval Center geliştirmesi,
UI yeniden tasarımı, mobil build veya otomatik migration YAPILMADI.

## 1. Belirti (gerçek cihaz telemetrisi)

| Uç | Sonuç | Süre |
|----|-------|------|
| POST /api/push/register-device | 504 | ~60s (x3) |
| GET /api/guardian/health | 504 | ~90s |
| GET /api/realtime | ERR | 16–120s |
| GET /api/auth/session | 500 | ~18s (x3) |
| GET /api/state | ERR | ~50s |

Toplam 95 istek / 65 hata / 30 timeout. Buna rağmen Guardian kartları "Sağlıklı"
gösteriyordu.

## 2. Kök neden (tek ana sebep + yan etkiler)

**Ana sebep:** Tüm oturum okuma fonksiyonları (`getSession`, `getSessionForBootstrap`,
`getSessionForQr`) attempt-timeout'suz `runSql` kullanıyordu. Vercel'in donmuş
instance'ında pooler bağlantısı bayatsa, bu okumalar postgres.js'in uzun TCP
zaman aşımına kadar **sınırsız** bekliyordu. Oturuma bağlı her uç bundan etkilendi:

- `auth/session` → dış sarmalayıcı 3×6sn = 18sn sonra 500
- `realtime` (customer-loyalty/history/promos) → `getSessionForBootstrap` askıda → 90–120sn
- `push/register-device` → `requireSession` askıda → Vercel 60sn'de 504
- `guardian/health` (detailed) → `requireAdminSession` askıda → 90sn 504
- `state` → oturum + ağır sorgu askıda → ~50sn ERR

**Yan etkiler:** İstemcide kısa devre/dedup olmadığı için askıda kalan uçlar retry
storm yaratıyordu; Guardian paneli yalnızca server metriğine bakıp client
telemetrisini severity'ye katmadığı için "Sağlıklı" gösteriyordu.

## 3. Uygulanan düzeltmeler

### Server (kök neden)
- `api/_lib/auth.js`: `getSession`, `getSessionForBootstrap`, `getSessionForQr` artık
  **`runSqlRead`** kullanıyor → her deneme 6sn ile sınırlı, bayat bağlantıda fail-fast.
  `requireAdminSession` light yolundaki ham `findCustomerById` de `runSqlRead` ile sınırlandı.
- `api/_lib/handlers/authSession.js`: GET attempt `5000ms / retries:1` (en kötü ~10sn).
  Transient DB hatasında **503 `SESSION_TEMPORARILY_UNAVAILABLE`** (önceki 18sn 500 yerine).
- `api/_lib/guardian/guardianConstants.js`: `DB_HEALTH_TIMEOUT_MS` 6000 → **2500**.
- `api/_lib/handlers/guardian.js`: public + detailed health'e **8sn sert deadline**
  (`withHealthDeadline`). Süre dolarsa "degraded" özet döner, Vercel 504'üne düşmez.

### İstemci (fail-fast + retry storm engeli)
- `src/lib/backgroundCircuit.js` (YENİ): 3 ardışık hata → 60sn devre açık; başarı/manuel
  aksiyon sıfırlar. Yalnızca arka plan isteklerini engeller; login submit'i engellemez.
- `src/lib/realtimeFetch.js`: müşteri realtime fetch'leri **6sn timeout**, **path bazlı
  in-flight dedup** (aynı anda iki istek başlamaz), **realtime circuit breaker**.
- `src/lib/firebasePush.js`: `register-device` **5sn timeout**, **retryTransient:false**,
  **push circuit breaker**. Manuel "Bildirimleri aç" devreyi sıfırlar (`resetPushCircuit`).
- `src/lib/pushPrompt.js`: logout revoke timeout 8sn → 5sn.
- `src/lib/safeMode.js`: `isCustomerRealtimeDisabled()` (VITE_DISABLE_REALTIME=true veya
  Safe Mode realtime degraded).
- `src/hooks/useCustomerRealtime.js`: realtime kapalıysa kanal hiç açılmaz.
- `src/hooks/useCustomerLoyaltyPoll.js`: Safe Mode/kapalıyken yedek yoklama 120sn'ye çekilir
  (zaten görünürlük/native-active kontrolü vardı → arka planda durur).

### Guardian doğruluk
- `src/lib/clientHealthSeverity.js` (YENİ): son 20 client isteğinden overall severity +
  servis bazlı incident türetir (kurallar bölüm 6'daki gibi).
- `src/components/SystemHealthPanel.jsx`: overall = `worst(server, client)`. Kartlar
  client incident varsa yeşil kalmaz; "Son Incident'lar"a client-only incident eklenir.

## 4. Kabul kriterleri karşılığı

| Kriter | Durum |
|--------|-------|
| Login 60–120sn beklemeyecek | ✅ session okuma 6sn fail-fast |
| auth/session 18sn 500 döngüsü | ✅ ~10sn + 503 SESSION_TEMPORARILY_UNAVAILABLE |
| realtime 90–120sn pending | ✅ 6sn timeout + dedup + devre kesici |
| push 60sn login bloklama | ✅ 5sn timeout + fire-and-forget + devre kesici |
| guardian/health 90sn 504 | ✅ 2.5sn DB ping + 8sn deadline |
| 65 hata/30 timeout → "Sağlıklı" | ✅ client severity overall'a katılır |
| Safe Mode'da arka plan yükü azalır | ✅ realtime kapanır, poll 120sn |
| Build/test geçer | ✅ 353 test, build OK, lint 0 hata |

## 5. Doğrulama çıktıları
- `EMERGENCY_TEST_OUTPUT.txt` — 353 test pass (9 yeni emergency testi)
- `EMERGENCY_BUILD_OUTPUT.txt` — vite build OK
- `EMERGENCY_LINT_OUTPUT.txt` — 0 error, 55 warning (önceden var olan)
- `EMERGENCY_AUDIT_OUTPUT.txt` — 8 moderate (firebase-admin transitive; bu turda eklenmedi)

## 6. Yapılmayanlar (bilinçli)
Yeni Autopilot/Approval Center, mobil build, büyük refactor, otomatik migration,
Firebase upgrade, tasarım düzenleme, LP/veri düzeltme, deploy otomasyonu.
