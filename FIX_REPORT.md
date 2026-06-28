# FIX_REPORT — Production Performans & Stabilite Düzeltmeleri

Bu tur, teşhis raporlarında (`ROOT_CAUSE_REPORT.md` vb.) tespit edilen kök
nedenlere yönelik **hedefli** düzeltmeleri içerir. Büyük refactor yapılmadı;
her madde için test eklendi/güncellendi. Gerçek env/secret değeri yazdırılmadı,
production DB'ye dokunulmadı.

Özet sonuçlar:

- `npm test`: **271 test, 0 fail**
- `npm run build`: **başarılı** (vite build + test)
- `npm run lint`: **0 hata**, 85 uyarı (önceden 273 — JSX yanlış pozitifleri temizlendi)
- `npm audit`: 8 orta seviye açık (bu turdan bağımsız, transitive: `@google-cloud/storage → teeny-request → retry-request`)

---

## 1) QR hızlı düzeltme

**Kök neden:** `api/qr.js` için `maxDuration` yoktu; web'de cookie varken bile
QR açılışı önce session hidrasyonu bekliyordu (gereksiz ek serverless çağrısı +
cold-start gecikmesi).

**Değişen dosyalar:**
- `vercel.json` — `functions` bloğuna `"api/qr.js": { "maxDuration": 30 }`.
- `src/pages/QrPage.jsx` — `needsStoredBearerToken = isNativeApp()`. Bearer token
  zorunluluğu ve `hydrateSessionTokenFromServer()` artık **yalnızca native**'de.
  Web doğrudan `/api/qr/generate` çağırır (cookie ile).

**Test:** `tests/qr-birthday.test.mjs` (maxDuration + web by-pass mantığı).

---

## 2) LP işlemindeki algısal donma

**Kök neden:** Kasiyer LP işlemi 60 sn'lik genel admin timeout'unu kullanıyordu;
UI yalnızca butonu disable ettiği için "uygulama dondu" hissi veriyordu; başarıdan
sonra gereksiz tam `/api/state` pull yapılıyordu.

**Değişen dosyalar:**
- `src/lib/apiClient.js` — `LOYALTY_ACTION_REQUEST_OPTIONS = { timeoutMs: 15_000 }`.
- `src/lib/qrClient.js` — `postLoyaltyAction` artık LP timeout'unu kullanıyor.
- `src/components/CustomerQrScanner.jsx` — LP işlenirken görünür "LP işleniyor…"
  ilerleme göstergesi; başarı yolundan tam `/api/state` pull kaldırıldı (sonuç
  zaten `result.customer`/`result.loyalty` ile local state'e işleniyor); hata
  durumunda `actionBusy` `finally`'de temizleniyor.
- `src/style.css` — `.scanProcessing` / spinner stilleri.

**Test:** `tests/lp-perceived-freeze.test.mjs`.

---

## 3) Login sonrası gereksiz tam state pull + admin fan-out tekilleştirme

**Kök neden:** Login yanıtı zaten customer/loyalty/session döndürürken `useCommit`
girişten ~120ms sonra zorunlu tam `/api/state` pull yapıyordu; admin PIN doğrulama
hem effect hem handler üzerinden çift members + full state fan-out tetikliyordu.

**Değişen dosyalar:**
- `src/hooks/useCommit.js` — ilk zorunlu tam pull `INITIAL_REMOTE_SYNC_DELAY_MS`
  (6sn) ile ertelendi; periyodik (hafif, since-tabanlı) timer hemen kurulur.
- `src/App.jsx` — `handleAdminVerified` artık members/state çekmiyor; tek kanal
  olarak `adminHydrated` effect'i çalışıyor. Logout'ta `adminHydratedRef` sıfırlanır.

**Test:** `tests/login-initial-sync.test.mjs`.

---

## 4) Günlük LP ödülündeki global `app_state` kilidi kaldırıldı  ⚠️ MIGRATION

**Kök neden:** Günlük ödül akışı `SELECT data FROM app_state ... FOR UPDATE` ile
global JSON blob'u kilitliyordu → tüm günlük claim'ler global darboğaz.

**Yeni yapı:** Claim'ler normalize `daily_claims` tablosunda satır bazlı tutulur;
`(customer_id, type, day)` tekilliği ile çift claim engellenir. İşlem yalnızca
ilgili müşterinin satırını `FOR UPDATE` ile kilitler (global kilit yok).

**Değişen dosyalar:**
- `api/_lib/dailyClaimsStore.js` (yeni) — şema garantisi, claim okuma, idempotent
  `insertDailyClaim` (ON CONFLICT DO NOTHING).
- `api/_lib/customerRewards.js` — `applyDailyLoginRewardRelational` yeniden yazıldı
  (müşteri bazlı kilit + tablo claim + global blob yazımı yok).
- `api/_lib/relationalState.js` — `dailyClaims` artık tablodan okunuyor
  (`composeStateFromRelational` / `composeStateForCustomer`).
- `scripts/sql/005_daily_claims_dedup.sql` (yeni migration).

**Riskli migration:** ✅ Evet. Detay:
- `005_daily_claims_dedup.sql` idempotenttir (ALTER ADD COLUMN IF NOT EXISTS +
  CREATE UNIQUE INDEX IF NOT EXISTS). Tablo `001` şemasında zaten mevcut.
- Backfill bloğu yorum içinde, opsiyonel ve `ON CONFLICT DO NOTHING` ile güvenli
  (mevcut JSON `dailyClaims` kayıtlarını tabloya taşır).
- **Rollback notu** dosyanın altında. Rollback yalnızca kod sürümü geri alındıktan
  sonra ve acil durumda uygulanmalı.
- Migration **canlıya kod deploy edilmeden ÖNCE** çalıştırılmalı (kod artık
  tablodaki sütunları bekliyor; ayrıca `ensureDailyClaimsSchema` runtime'da eksik
  sütunları idempotent ekler — yine de migration tercih edilir).

**Test:** `tests/daily-claim-dedup.test.mjs` (aynı müşteri çift claim alamaz; farklı
müşteriler eşzamanlı claim yapabilir; global kilit kaynak kontrolü).

---

## 5) DB stale connection / timeout stratejisi (güvenli)

**Kök neden:** login/session dışında çoğu DB ucunda bayat pooler bağlantısına karşı
attempt timeout yoktu (uzun stall'lar → "sunucuya ulaşılamadı").

**Yaklaşım (güvenli):**
- **Read** uçları: `runSqlRead` → `attemptTimeoutMs: 6000` (erken fail + retry).
- **Write** uçları: `runSql` (attempt timeout YOK — körlemesine `Promise.race`
  ile çift yazma riski oluşmasın). Yazma stall'ı transaction içinde
  `SET LOCAL statement_timeout = '8000ms'` ile DB tarafında sınırlanır. Idempotency
  zaten nonce (loyalty-action) ve unique constraint (daily-claim) ile sağlanıyor.

**Değişen dosyalar:**
- `api/_lib/runSql.js` — `runSqlRead` eklendi.
- `api/state.js`, `api/_lib/handlers/adminLoyalty.js`, `api/_lib/handlers/realtimeFetch.js`
  — read çağrıları `runSqlRead`'e geçirildi; yazma `runSql`'de kaldı.
- `api/_lib/loyaltyStore.js`, `api/_lib/customerRewards.js` — yazma transaction'larına
  `SET LOCAL statement_timeout`.

**Test:** `tests/db-timeout-strategy.test.mjs` (read fail-fast/retry; write tek kez
çalışır — çift mutasyon yok; statement_timeout kaynak kontrolü).

---

## 6) Admin panel LP çift tık guard

**Kök neden:** `addCategory`/`removeCategory`/`redeemCategory`'de in-flight guard yoktu.

**Değişen dosyalar:**
- `src/pages/AdminPage.jsx` — `(müşteri|action|kategori)` bazlı ref-tabanlı
  (senkron) `pendingLp` + `runGuardedLp`. Aynı anda ikinci istek engellenir; hata/
  başarı sonrası `finally`'de temizlenir.
- `src/components/StampCategoryPanel.jsx` — admin butonları `busy` iken disabled.

**Test:** `tests/admin-lp-guard.test.mjs`.

---

## 7) Admin / realtime / polling çakışması azaltıldı

**Kök neden:** Admin members + dashboard stats interval'leri arka planda da çalışıyordu;
QR sekmesinde 5sn'lik (ilk pull öncesi tam state'e dönüşebilen) poll; tam state pull
sonrası `useCommit` içinde gömülü members fan-out → duplicate fetch.

**Değişen dosyalar:**
- `src/hooks/usePageActive.js` (yeni) — görünürlük + native ön plan birleşik aktiflik.
- `src/lib/appForeground.js` — `subscribeActiveChange` (ön plan/arka plan bildirimi).
- `src/hooks/useAdminMembers.js`, `src/hooks/useAdminDashboardStats.js` — polling
  arka planda/gizliyken durur, ön plana dönünce yenilenir.
- `src/hooks/useCommit.js` — native arka planda interval kurulmaz; gömülü admin
  members fan-out kaldırıldı (tek kanal: `useAdminMembers`).
- `src/lib/syncPolicy.js` — QR/kasa poll aralığı 5sn → 15sn.

**Test:** `tests/admin-polling-dedup.test.mjs`, güncellenen `tests/sync-policy.test.mjs`.

---

## 8) Logout ve storage hijyeni

**Kök neden:** Logout'ta token/admin snapshot temizleniyordu ama `liberteDB` (PII:
müşteri/loyalty/history) cihazda kalıyordu; açılışta büyük cache senkron parse ediliyordu.

**Değişen dosyalar:**
- `src/lib/db.js` — `clearLocalDb()`; açılışta `LOCAL_DB_MAX_CHARS` (~2MB) üstü
  bozuk/şişmiş cache atılır (ilk render bloklanmaz).
- `src/lib/session.js` — `logoutSession` artık `clearLocalDb()` çağırır.
  `liberteLastPhone` / `liberteLastEmail` / `liberteDeviceId` korunur.

**Test:** `tests/logout-storage-hygiene.test.mjs`.

---

## 9) Observability header

**Kök neden:** `requestTrace` yalnızca log/body'ye yazıyordu; yanıt header'ı yoktu.

**Değişen dosyalar:**
- `api/_lib/sqlRequest.js` — tüm SQL uçlarına `x-request-id`, `x-handler`,
  `x-duration-ms` header'ları (gelen `x-request-id` korunur). Hata gövdesinde
  `requestId` taşınır. DB detayı sızdırılmaz.

**Test:** `tests/observability-headers.test.mjs`.

---

## 10) ESLint config düzeltmesi

**Kök neden:** `eslint-plugin-react` yoktu; JSX'te kullanılan bileşenler "unused"
gösteriliyordu (273 uyarının büyük kısmı yanlış pozitif).

**Değişen dosyalar:**
- `package.json` — `eslint-plugin-react` devDependency.
- `eslint.config.js` — `react/jsx-uses-vars` + `react/jsx-uses-react`.

**Sonuç:** Uyarı 273 → 85 (kalanlar gerçek: `react-hooks/*`, birkaç gerçek unused).

**Test:** `tests/eslint-config.test.mjs`.

---

## Canlıya çıkmadan önce manuel test adımları

1. **Migration (önce):** `scripts/sql/005_daily_claims_dedup.sql`'i Neon/Supabase SQL
   editöründe çalıştır. Gerekirse yorumdaki backfill bloğunu uygula.
2. **Deploy:** Kod sürümünü Vercel'e deploy et.
3. **Login (customer):** Telefon+PIN ile gir → ilk ekran login response ile anında
   açılmalı; ~6sn sonra arka planda tam sync olmalı. "Sunucuya ulaşılamadı" çıkmamalı.
4. **QR (web + native):** Kartım sekmesini aç → QR hızlı yüklenmeli (web'de session
   hidrasyonu beklenmemeli).
5. **LP işlemi (kasiyer):** QR okut → LP ekle → "LP işleniyor…" görünmeli, sonuç
   gelince panel açılmalı; tam `/api/state` çağrısı tetiklenmemeli.
6. **Günlük ödül:** Günde 1 kez alınabilmeli; aynı gün ikinci deneme "bugün zaten
   aldın" demeli. Farklı müşterilerde eşzamanlı sorun olmamalı.
7. **Admin PIN:** PIN doğrula → üye listesi tek kanaldan gelmeli (network'te çift
   members + full state isteği olmamalı).
8. **Admin çift tık:** Bir üyeye hızlı çift tık → tek POST gitmeli, buton kısa süre
   disabled olmalı.
9. **Arka plan:** Uygulamayı arka plana al → admin members/stats polling durmalı;
   ön plana dönünce yenilenmeli.
10. **Logout:** Çıkış yap → DevTools'ta `localStorage.liberteDB` silinmiş olmalı;
    `liberteLastPhone` korunmalı.
11. **Header:** Herhangi bir `/api/*` yanıtında `x-request-id` / `x-handler` /
    `x-duration-ms` header'ları görünmeli.

## Notlar / riskler

- `npm audit`'teki 8 orta seviye açık transitive (`@google-cloud/storage` zinciri)
  ve bu turdan bağımsız. `npm audit fix --force` major/breaking bump gerektirdiği
  için uygulanmadı; ayrı bir bakım turunda değerlendirilmeli.
- Migration **kod deploy'undan önce** çalıştırılmalı. `ensureDailyClaimsSchema`
  runtime güvenlik ağı olsa da migration tercih edilir.
