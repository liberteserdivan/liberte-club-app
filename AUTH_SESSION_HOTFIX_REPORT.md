# AUTH_SESSION_HOTFIX_REPORT

## Yapilan degisiklikler

### Backend
- api/_lib/runSql.js: runSqlSessionBootstrap (1800ms x 2 deneme, ~3.6s ust sinir)
- api/_lib/auth.js: getSessionForBootstrap -> runSqlSessionBootstrap
- api/_lib/handlers/authSession.js: dis withSqlRetry kaldirildi; token yok 401; gecersiz 401; transient 503

### Istemci
- src/lib/session.js: 401 null; 503 sessionUnavailable
- src/App.jsx: authNotice ile yumusak uyari, authReady set (login formu acik)
- LoginPage + apiErrors + errorLogClient: engelleyici modal yerine degraded mesaj

### Testler
- tests/auth-session-runtime.test.mjs (yeni)
- tests/auth-state-stability.test.mjs, tests/login-unreachable-modal.test.mjs guncellendi

## Dogrulama
- npm test: 493/493 pass
- npm run build: OK (~9s)
- npm run lint: 0 error, 57 warning

## Sure hedefi
runSqlSessionBootstrap behavioral test < 4000ms. Eski ~10060ms cift retry kaldirildi.

## Kapsam disi
/api/state, daily claim, admin members, migration, mobile build, secrets

## Degisen dosyalar
api/_lib/auth.js, api/_lib/handlers/authSession.js, api/_lib/runSql.js
src/App.jsx, src/lib/session.js, src/lib/apiErrors.js, src/lib/errorLogClient.js, src/pages/LoginPage.jsx
tests/auth-session-runtime.test.mjs, tests/auth-state-stability.test.mjs, tests/login-unreachable-modal.test.mjs

## Deploy
Hotfix henuz commit/push edilmedi.