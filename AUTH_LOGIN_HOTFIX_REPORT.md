# AUTH Login Hotfix Report

## Dosyalar
- api/_lib/handlers/authLogin.js (yeniden yazildi)
- api/_lib/auth.js (getSessionIdentityForLogin, createSessionOnce)
- api/_lib/runSql.js (runSqlLoginRead)
- api/_lib/routeTiming.js (LOGIN_MS: 6000)
- src/pages/LoginPage.jsx (503 handling, tek POST, loading re-enable)
- tests/auth-login-runtime.test.mjs (yeni)
- tests/auth-state-stability.test.mjs, faz2-fixes.test.mjs, phone-normalize.test.mjs

## Sonuc
- npm test: 508/508 pass
- npm run build:release: ok
- npm run lint: 0 error

Web deploy onerilir. Mobil build baslatilmadi.
