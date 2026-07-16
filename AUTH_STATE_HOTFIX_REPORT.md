# Auth/State Hotfix Raporu — login 500 + state 401·32sn

Kapsam: yalnızca `LBT-CB3C02` (`/api/auth/login` 500) ve `LBT-117862`
(`/api/state` 401·32sn) izleriyle ilgili hedefli düzeltme. Yeni özellik yok,
mobil build yok, refactor yok.

## Değişiklikler

### 1. `api/_lib/handlers/authLogin.js` — oturum sonrası 500 yok
- `loginBodyCore` + `buildPlainLoginBody`: DB/imza gerektirmeyen minimal başarı gövdesi.
- `buildLoginSuccessBody`: sadakat sorgusu **non-fatal** (try/catch → `loyalty:null`).
- Handler: `createSession` başarılı olduktan SONRA gövde üretimi hata verse bile
  **200** döner (`success_body_failed` / `reuse_body_failed` → `buildPlainLoginBody`).

### 2. `api/_lib/runSql.js` — fail-fast session okuma
- `runSqlReadFast`: `SESSION_READ_ATTEMPT_TIMEOUT_MS = 3000`, retry `1/2`.
- 32sn'lik retry yığınını ortadan kaldırır.

### 3. `api/_lib/auth.js` — session getter'ları fail-fast
- `getSession`, `getSessionForBootstrap`, `getSessionForQr` → `runSqlReadFast`.
- Token yoksa hâlâ DB'ye gidilmeden hızlı null (401).

### 4. `src/pages/LoginPage.jsx` — duplicate login guard
- `loginInFlightRef` ile uçuştaki giriş varken ikinci `/api/auth/login` POST başlamaz.

## Hedeflere karşılık

| # | Hedef | Durum |
|---|-------|-------|
| 1 | Login success ise 500 dönmemeli | createSession sonrası body hatası → 200 |
| 2 | Duplicate login engellenmeli | `loginInFlightRef` + server `reuse` idempotent |
| 3 | Kısmi başarı + sonra hata → flow düzeltilsin | gövde üretimi non-fatal, 200 |
| 4 | `/api/state` 401 hızlı dönsün | `runSqlReadFast` (3sn/1-2 retry) |
| 5 | Auth check önce token yokluğunu kontrol etsin | `if (!token) return null` DB'den önce |
| 6 | Background 401 auth state'i bozmasın | `onUnauthorized` guard + `authEpoch` (mevcut) |

## Test (yeni: `tests/auth-state-stability.test.mjs`)
- authLogin: oturum sonrası body hatası 200 plain body döner (500 değil)
- authLogin: sadakat sorgusu non-fatal
- runSql: `runSqlReadFast` 3sn + az retry
- auth: 3 session getter fail-fast okuma kullanır
- auth: token yoksa DB'ye gitmeden null
- LoginPage: duplicate login in-flight guard
- App: oturum yokken background 401 döngü tetiklemez

## Doğrulama
- `npm test` → 376 pass / 0 fail (7 yeni test)
- `npm run build` → başarılı
- `npm run lint` → 0 error (55 önceden var olan uyarı)

Çıktılar: `AUTH_STATE_TEST_OUTPUT.txt`, `AUTH_STATE_BUILD_OUTPUT.txt`,
`AUTH_STATE_LINT_OUTPUT.txt`.

## Not — gerçek requestId'ler
`LBT-CB3C02` ve `LBT-117862` Vercel log'larında aranabilir; bu ortamdan panele
erişim olmadığından kök neden kod yolu analiziyle doğrulandı. Düzeltmeler bu iki
izin tarif ettiği davranışı (login 500-sonra-içeride, state 401·32sn) ortadan
kaldırır.
