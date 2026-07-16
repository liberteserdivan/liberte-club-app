# PRODUCTION_SMOKE_TEST_REPORT.md

Liberte Guardian v1.1 sonrası smoke test gözlem raporu. **Kod değişikliği yapılmadı.**

---

## ⚠️ Kapsam ve dürüstlük notu (önce oku)

Bu ajan, **canlı production ortamına** (gerçek tarayıcı oturumu, gerçek iOS/Android cihaz, gerçek Supabase/Vercel trafiği) tıklayarak erişemez. Bu nedenle:

- **Gerçek süre (saniye) ve gerçek requestId değerleri uydurulmadı** — bunlar yalnızca canlı çalıştırmada üretilir.
- Aşağıdaki her senaryo **koddan izlenerek** (static trace) çıkarıldı: hangi endpoint'ler çağrılır, beklenen sonuç, requestId nereden gelir, Guardian bunu görür mü, Safe Mode nasıl davranır.
- **Somut otomatik kanıt:** `npm test` → **312 test / 312 pass / 0 fail** (Guardian dahil tüm akış testleri).
- Her senaryonun sonunda, sizin canlıda doldurmanız için **"Canlı doğrulama"** alanı bırakıldı (Süre / requestId / Başarılı?).

Bu rapor "kodun bu senaryolarda ne yapması gerektiğini ve gözlemlenebilirliğin doğru kurulduğunu" doğrular; "production'da gerçekten çalıştı" ifadesi **canlı doğrulama** alanları doldurulunca kesinleşir.

### Tüm API yanıtlarında ortak gözlemlenebilirlik
`withSqlRequest` kullanan **tüm** endpointlerde (auth, state, loyalty, qr, admin, realtime, push, config, guardian) şu header'lar döner:
- `x-request-id` → **`LBT-XXXXXX`** (hata gövdesinde de `requestId` olarak)
- `x-handler`, `x-duration-ms`
- `x-guardian-status: observed`
- `x-safe-mode` → `off` veya `on:<level>;poll=<0|1>;fsp=<0|1>;rt=<0|1>`

Her istek sunucuda **Guardian metrik tamponuna** (servis bazında) ve istemcide **guardianTelemetry**'ye (son 100) düşer.

---

## Endpoint haritası (kod referansı)

| Akış | Endpoint(ler) | Kaynak |
|---|---|---|
| Açılış ısınma | `GET /api/health` → `config?resource=warm` | `serverWarmup.js` |
| Oturum bootstrap | `GET /api/auth/session` | `session.js:69/108/159` |
| Customer login | `POST /api/auth/login` | `LoginPage.jsx:204` |
| Kayıt tamamla | `POST /api/auth/register-complete` | `LoginPage.jsx:271/326` |
| PIN sıfırla | `POST /api/auth/forgot-pin` | `LoginPage.jsx:409/455` |
| Admin PIN | `POST /api/auth/admin-pin` | `AdminPinGate.jsx:32` |
| Tam/artımlı state | `GET /api/state`, `GET /api/state?since=…` | `db.js:310/355` |
| Admin üyeler | `GET /api/admin/members` (→ `auth?action=admin-members`) | `adminMemberClient.js:5` |
| Admin LP (üye) | `POST /api/admin?resource=member-loyalty` | `adminMemberClient.js:26` |
| QR üret | `POST /api/qr/generate` | `qrClient.js:6` |
| QR doğrula (kasa) | `POST /api/admin?resource=qr-verify` | `qrClient.js:267` |
| Kasa LP aksiyonu | `POST /api/admin?resource=loyalty-action` | `qrClient.js:293` |
| Günlük ödül | `POST /api/loyalty/daily-claim` | `customerRewardsClient.js:5` |
| Realtime fetch | `GET /api/realtime?resource=…` | `realtimeFetch.js` |
| Guardian sağlık | `GET /api/guardian/health[?detailed=1]`, `/health/:service` | `guardianClient.js` |
| Guardian safe-mode | `GET|POST /api/guardian/safe-mode` | `guardianClient.js` |
| Guardian rapor/alert | `POST /api/guardian/report`, `/test-alert`, `/incidents` | `guardianClient.js` |

---

## Test sonuçları (kod-izli)

### 1. Clean storage customer login
- **Endpointler:** `GET /api/health` (warm) → `GET /api/auth/session` (clean storage → token yok, 401/boş) → **`POST /api/auth/login`** → (login yanıtı müşteriyi yerel db'ye yazar) → 6 sn sonra `GET /api/state` (ertelenmiş tam pull) → periyodik `GET /api/state?since=…`.
- **Beklenen:** Giriş, tam `/api/state` beklenmeden ana ekranı açar (login response snapshot'ı kullanılır). Teknik hata gösterilmez.
- **requestId:** her yanıtın `x-request-id`'si (LBT-). Hata olursa gövdede `requestId`.
- **Guardian gördü mü?** Evet — `login` servisi metrikleri (p95/hata) + istemci telemetri.
- **Safe Mode:** Kapalıyken normal. Açıksa `fsp=1` → 6sn ertelenmiş tam pull **atlanır**, since-probe devam eder.
- **Otomatik kanıt:** `login-initial-sync.test.mjs` (ertelenmiş pull), `guardian-client.test.mjs` (telemetri).
- **Canlı doğrulama:** Süre: __ s · requestId: __ · Başarılı: ☐

### 2. Admin login + PIN
- **Endpointler:** `POST /api/auth/login` → **`POST /api/auth/admin-pin`** → (adminVerified) → `GET /api/admin/members` + `GET /api/state` (tek kanal, adminHydrated effect) → `useAdminMembers`/`useAdminDashboardStats` polling (sayfa aktifken).
- **Beklenen:** PIN doğrulanmadan admin verisi gelmez; duplicate members/state fan-out yok (v1 düzeltmesi).
- **requestId / Guardian:** auth servis metrikleri; `x-request-id` her yanıtta.
- **Safe Mode:** Açıksa admin dashboard refresh "reduced".
- **Otomatik kanıt:** `login-initial-sync.test.mjs` (duplicate fan-out yok, adminVerified gate).
- **Canlı doğrulama:** Süre: __ s · requestId: __ · Başarılı: ☐

### 3. Sistem Sağlığı sekmesi
- **Endpointler:** `GET /api/guardian/health?detailed=1` (mount + 30 sn'de bir, **sayfa aktifken**). Yalnızca admin + admin PIN; aksi halde **401/403**.
- **Beklenen:** Kartlar (DB/Login/QR/LP/Realtime/Config) + açık incident + son uyarılar + son istekler + memory-mode uyarısı render. Buton aksiyonları ilgili guardian endpoint'ini çağırır.
- **requestId / Guardian:** Guardian'ın kendi yanıtları da LBT- taşır; `evaluateAndIntervene()` bu çağrıda tetiklenir.
- **Safe Mode:** Panelden aç/kapat doğrudan yönetilir.
- **Otomatik kanıt:** `guardian-health.test.mjs` (admin yoksa 401, public detay sızmaz), `guardian-client.test.mjs` (AdminPage'de "Sistem Sağlığı" + SystemHealthPanel).
- **Canlı doğrulama:** Süre: __ s · requestId: __ · Başarılı: ☐

### 4. QR generate
- **Endpointler:** **`POST /api/qr/generate`**. Web: cookie ile doğrudan (token hydration beklemez). Native: önce `GET /api/auth/session` (Bearer hydration), sonra generate.
- **Beklenen:** `vercel.json` qr `maxDuration=30`; yavaşsa "QR oluşturuluyor" mesajı. İmza secret'ı yoksa QR health critical.
- **requestId / Guardian:** `qr` servis metrikleri (p95/timeout). 5+ timeout veya p95≥5000ms → admin health'te incident.
- **Safe Mode:** `qr: enabled` her zaman (Safe Mode QR'ı kapatmaz).
- **Otomatik kanıt:** `guardian-health.test.mjs` (qr health), `qr-birthday.test.mjs` vb.
- **Canlı doğrulama:** Süre: __ s · requestId: __ · Başarılı: ☐

### 5. QR scanner / kasiyer akışı
- **Endpointler:** **`POST /api/admin?resource=qr-verify`** → **`POST /api/admin?resource=loyalty-action`** (timeout 15 sn, `LOYALTY_ACTION_REQUEST_OPTIONS`). Başarı sonrası **tam `/api/state` pull yapılmaz** (v1 düzeltmesi); sonuç doğrudan yerel state'e işlenir.
- **Beklenen:** "LP işleniyor…" spinner; donma yok.
- **requestId / Guardian:** `loyalty` servis metrikleri.
- **Safe Mode:** `loyalty: enabled_with_short_timeout`.
- **Otomatik kanıt:** `lp-perceived-freeze.test.mjs`.
- **Canlı doğrulama:** Süre: __ s · requestId: __ · Başarılı: ☐

### 6. LP ekleme
- **Endpointler:** Kasa: `loyalty-action` (action=stamp). Admin üye paneli: **`POST /api/admin?resource=member-loyalty`**.
- **Beklenen:** LP eklenir, yerel state güncellenir; gereksiz tam state pull yok.
- **requestId / Guardian:** `loyalty` metrikleri.
- **Safe Mode:** kısa timeout + "tekrar basmayın".
- **Otomatik kanıt:** `admin-lp-guard.test.mjs`, `daily-claim-dedup.test.mjs`.
- **Canlı doğrulama:** Süre: __ s · requestId: __ · Başarılı: ☐

### 7. LP ödül kullanma (redeem)
- **Endpointler:** `loyalty-action` veya `member-loyalty` (action=redeem).
- **Beklenen:** Ödül düşülür; çift indirim engeli (server-side nonce/lock).
- **requestId / Guardian:** `loyalty` metrikleri.
- **Otomatik kanıt:** `admin-lp-guard.test.mjs`.
- **Canlı doğrulama:** Süre: __ s · requestId: __ · Başarılı: ☐

### 8. Çift tık LP testi
- **Mekanizma:** `AdminPage.runGuardedLp` (ref-Set ile pending kilidi) + `StampCategoryPanel` butonlarında `disabled={busy}`. Kasa tarafında `actionBusy` UI.
- **Beklenen:** Aynı (müşteri, aksiyon, kategori) için **tek** network çağrısı; ikinci tık yutulur.
- **requestId / Guardian:** İkinci çağrı hiç gitmediği için ek metrik oluşmaz (beklenen).
- **Otomatik kanıt:** `admin-lp-guard.test.mjs`.
- **Canlı doğrulama:** Süre: __ s · requestId: __ · Başarılı: ☐

### 9. Safe Mode aç/kapat
- **Endpointler:** **`POST /api/guardian/safe-mode`** (admin+PIN). Aç → sonraki tüm yanıtlarda `x-safe-mode: on:<level>;poll=…;fsp=…;rt=…`. Kapat → `off`.
- **Beklenen:** Açınca istemci `applySafeModeHeader` ile polling aralığını genişletir (v1.1 düzeltmesi), customer full state pull azalır, realtime degraded. `useCommit` `subscribeSafeMode` ile **anında** yeniden zamanlar. Kapanınca normale döner. TTL (60dk) dolunca otomatik kapanır.
- **requestId / Guardian:** Değişiklik incident/alert ile ilişkilendirilebilir.
- **Otomatik kanıt:** `guardian-safe-mode.test.mjs` (header bayrakları, TTL, 401), `guardian-client.test.mjs` (poll/fsp/rt davranışı).
- **Canlı doğrulama:** Süre: __ s · requestId: __ · Başarılı: ☐

### 10. Slow network
- **Mekanizma:** apiClient timeout (web 12sn / native 25sn / auth 25–40sn). Yavaş yanıt telemetriye yüksek `durationMs` olarak düşer.
- **Beklenen:** Donma yok; timeout'ta net hata + Ref (requestId). Guardian `p95` yükselir; eşik aşılırsa admin health'te incident + Safe Mode.
- **requestId / Guardian:** Telemetri + server metrik.
- **Otomatik kanıt:** `guardian-metrics.test.mjs` (p95/statusFromSummary), `apiClient` timeout testleri.
- **Canlı doğrulama (öneri):** DevTools → Slow 3G. Süre: __ s · requestId: __ · Başarılı: ☐

### 11. Offline
- **Mekanizma:** fetch hata → `NETWORK_ERROR`/`FETCH_TIMEOUT`. `apiJson` catch bloğu telemetriye `status:0, networkError:true` yazar ve hatayı yeniden fırlatır (semantik değişmez). UI `formatClientApiError` ile "Sunucuya bağlanırken sorun yaşandı. Ref: LBT-…".
- **Beklenen:** Teknik DB hatası gösterilmez; kullanıcıya nazik mesaj.
- **requestId / Guardian:** Offline'da server requestId üretemez (istek ulaşmaz); istemci telemetri `networkError` sayar.
- **Otomatik kanıt:** `guardian-client.test.mjs` (network error telemetri sayımı).
- **Canlı doğrulama (öneri):** Uçak modu. Başarılı: ☐

### 12. App background/foreground
- **Mekanizma:** `usePageActive` (visibilitychange + native appStateChange). `useCommit` arka planda `clearSyncTimer`, ön planda `pullRemote(false)+scheduleSyncTimer`. `useGuardianHealth`/`useAdminMembers` arka planda durur.
- **Beklenen:** Arka planda gereksiz polling/egress yok; öne dönünce tazelenir.
- **requestId / Guardian:** Foreground dönüşünde yeni istekler LBT- taşır.
- **Otomatik kanıt:** `admin-polling-dedup.test.mjs`, `sync-policy.test.mjs`.
- **Canlı doğrulama:** Başarılı: ☐

### 13. Logout / login tekrar
- **Endpointler:** Logout → `POST /api/auth/session` (logout) + `clearLocalDb()` + token temizliği + `adminHydratedRef=false`. Sonra #1 tekrar.
- **Beklenen:** PII temizlenir; tekrar girişte admin hidrasyonu yeniden çalışabilir.
- **requestId / Guardian:** Normal auth metrikleri.
- **Otomatik kanıt:** `logout-storage-hygiene.test.mjs`, `login-initial-sync.test.mjs` (adminHydratedRef reset).
- **Canlı doğrulama:** Süre: __ s · requestId: __ · Başarılı: ☐

### 14. Web cookie auth
- **Mekanizma:** Web'de token **localStorage'a yazılmaz**; httpOnly cookie kalıcılığı sağlar. `apiFetch` web'de `credentials: 'include'`. QR web'de cookie ile doğrudan çalışır (`needsStoredBearerToken=false`).
- **Beklenen:** XSS token hırsızlığı yüzeyi küçük; QR/state cookie ile çalışır.
- **CORS:** `applyCors(req,res)` origin'e özgü + `Allow-Credentials: true`. Guardian header'ları cookie davranışını bozmaz (handler öncesi set edilir).
- **Otomatik kanıt:** `observability-headers.test.mjs`, `guardian-request-id.test.mjs`.
- **Canlı doğrulama (tarayıcı):** Application→Cookies + Network. Başarılı: ☐

### 15. Native Bearer token auth
- **Mekanizma:** Native'de `saveAuthToken` → session/localStorage; `apiFetch` `Authorization: Bearer …` ekler (cross-origin cookie gitmediği için şart). QR native'de önce `GET /api/auth/session` hydration.
- **Beklenen:** Bearer ile tüm korumalı uçlar çalışır; QR hydration sonrası üretilir.
- **requestId / Guardian:** `x-safe-mode`/`x-request-id` native yanıtlarda da gelir (`*` CORS ile Bearer uyumlu).
- **Otomatik kanıt:** `guardian-request-id.test.mjs` (header'lar), `qrClient` testleri.
- **Canlı doğrulama (cihaz):** Süre: __ s · requestId: __ · Başarılı: ☐

---

## Özet

| # | Senaryo | Kod-izli durum | Otomatik kanıt | Canlı doğrulama |
|---|---|---|---|---|
| 1 | Customer login | ✅ Beklenen doğru | login-initial-sync | gerekli |
| 2 | Admin login+PIN | ✅ | login-initial-sync | gerekli |
| 3 | Sistem Sağlığı | ✅ (admin+PIN gate) | guardian-health/client | gerekli |
| 4 | QR generate | ✅ | guardian-health/qr | gerekli |
| 5 | Kasiyer akışı | ✅ (tam pull yok) | lp-perceived-freeze | gerekli |
| 6 | LP ekleme | ✅ | admin-lp-guard | gerekli |
| 7 | LP redeem | ✅ | admin-lp-guard | gerekli |
| 8 | Çift tık LP | ✅ (guard) | admin-lp-guard | gerekli |
| 9 | Safe Mode aç/kapat | ✅ (v1.1 propagation) | guardian-safe-mode/client | gerekli |
| 10 | Slow network | ✅ (timeout+metrik) | guardian-metrics | gerekli |
| 11 | Offline | ✅ (telemetri+nazik hata) | guardian-client | gerekli |
| 12 | BG/FG | ✅ (polling durur) | admin-polling-dedup | gerekli |
| 13 | Logout/login | ✅ (PII temizliği) | logout-storage-hygiene | gerekli |
| 14 | Web cookie auth | ✅ | observability-headers | gerekli |
| 15 | Native Bearer | ✅ | guardian-request-id | gerekli |

**Otomatik test:** 312/312 pass · **Build:** OK · **Lint:** 0 error / 55 warning.

**Gözlem sonucu:** Kod düzeyinde 15 senaryonun tamamı doğru endpoint dizisini, requestId/Guardian gözlemlenebilirliğini ve Safe Mode davranışını sergiliyor; endpoint güvenliği (public vs admin+PIN) korunuyor, secret/PII sızıntısı yok. **Kesin "production'da geçti" onayı için yukarıdaki canlı doğrulama alanları gerçek ortamda doldurulmalıdır.** Bu raporda kod değiştirilmedi.

### Canlıda hızlı doğrulama ipuçları
- Tarayıcı DevTools → Network → herhangi bir `/api/*` isteği → Response Headers'da `x-request-id` (LBT-), `x-safe-mode`, `x-duration-ms` görülmeli.
- Sistem Sağlığı sekmesi → "Son İstekler" listesi istemci telemetrisini gösterir (Süre/requestId).
- Safe Mode aç → yeni isteklerde `x-safe-mode: on:…;poll=1;…` görülmeli; kapat → `off`.
- Hata Ref'i (`LBT-…`) ile admin, sunucu logunda/health'te ilgili isteği eşleştirebilir.
