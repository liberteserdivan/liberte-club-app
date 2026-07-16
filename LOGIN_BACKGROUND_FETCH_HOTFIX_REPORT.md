# Login Background Fetch — Hotfix Raporu

Kapsam: yalnızca login/logout arka plan istek bug'ı. Yeni özellik yok, mobil
build yok, refactor yok, migration yok.

## Yapılan Değişiklikler

### 1. authEpoch (sessionGeneration) — `src/lib/session.js`
- `getAuthEpoch()` eklendi; `bumpAuthEpoch()` her oturum geçişinde nesli ilerletir.
- Nesil ilerletilen yerler: `applyAuthResult` (login), `bootstrapSession` (cookie ile login),
  `setMemorySession` (App login/logout funnel), `logoutSession` (çıkış).
- Amaç: bir oturuma ait uçuştaki yanıt geç gelse bile, başladığı andaki epoch ≠
  güncel epoch ise **yok sayılır**; yeni auth state'i (login ekranı) ezilemez.

### 2. `/api/state` epoch guard — `src/hooks/useCommit.js`
- `pullRemote` başında `epochAtStart` yakalanır; `isStaleAuth()` ile kontrol edilir.
- `loadRemote()` (probe + tam pull) sonrası ve `setDb` öncesi stale kontrolü yapılır.
- Stale ise: `setDb`, `patchMemorySession`, `setSyncState` ÇALIŞMAZ → login ekranı
  eski `/api/state` 401/500/network yanıtından etkilenmez.

### 3. admin-customers epoch guard — `src/hooks/useAdminMembers.js`
- `pullMembers` başında `epochAtStart` yakalanır.
- Yanıt (başarı veya hata) geldiğinde epoch değiştiyse `setMembers/setError` ÇALIŞMAZ.

### 4. `onUnauthorized` koruması — `src/App.jsx`
- Handler başında `if (!getMemorySession()) return;` → oturum yokken (login ekranı)
  gelen arka plan 401'i logout/churn/bildirim tetiklemez.

### 5. `sessionRef` race düzeltmesi — `src/App.jsx`
- `sessionRef.current = session` artık **render sırasında senkron** atanıyor
  (eski effect kaldırıldı). Böylece `useCommit`'in effect'i her zaman güncel
  oturumu görür; logout sonrası login ekranında `/api/state` tetiklenmez.

### 6. `VITE_DISABLE_REALTIME` sert kill switch — `safeMode.js` + `realtimeFetch.js` + `App.jsx`
- `isRealtimeDisabledByFlag()` export edildi.
- `realtimeFetch.js`: bayrak açıkken `safeRealtimeRequest` (customer),
  `fetchAdminFeed` ve `fetchAdminCustomersStrict` **hiç `/api/realtime` çağırmaz**.
- `App.jsx`: `useAdminRealtime` enabled koşuluna `!isRealtimeDisabledByFlag()` eklendi.
- Sonuç: customer, admin, admin-customers, loyalty ve dashboard realtime kaynaklarının
  tümü bayrakla kapanır.

## Hedeflere Karşılık Gelme

| # | Hedef | Durum |
|---|-------|-------|
| 1 | Login ekranında protected background fetch yok | sessionRef race + epoch + onUnauthorized guard ile sağlandı |
| 2 | `/api/state` sadece geçerli session varsa | `canPullRemote` + senkron sessionRef |
| 3 | admin-customers sadece admin+PIN sonrası | `useAdminMembers` enabled (isAdmin&&adminVerified) |
| 4 | Logout'ta timer/in-flight etkileri iptal | timer cleanup + epoch guard (yanıt etkisiz) |
| 5 | `VITE_DISABLE_REALTIME` tüm kaynakları kapatır | safeMode/realtimeFetch/App tam kapsam |
| 6 | Background 401/500 login submit'i bozmaz | onUnauthorized + epoch guard |
| 7 | Login submit yalnızca `/api/auth/login` sonucuna bağlı | eski yanıt epoch ile ezilemez |
| 8 | authEpoch/sessionGeneration koruması | `session.js` getAuthEpoch + bumpAuthEpoch |

## Doğrulama

- `npm test` → 361 pass / 0 fail (9 yeni test dahil)
- `npm run build` → başarılı
- `npm run lint` → 0 error (yalnızca önceden var olan uyarılar)
- `npm audit` → 8 moderate (firebase-admin transitive, bu değişiklikle ilgisiz)

Çıktı dosyaları: `LOGIN_BACKGROUND_FETCH_TEST_OUTPUT.txt`,
`LOGIN_BACKGROUND_FETCH_BUILD_OUTPUT.txt`, `LOGIN_BACKGROUND_FETCH_LINT_OUTPUT.txt`,
`LOGIN_BACKGROUND_FETCH_AUDIT_OUTPUT.txt`.
