# AUTH LOGIN Phase - Hotfix Raporu

## Ozet

POST /api/auth/login icin faz izleme, minimal credential SQL ve deadline ayrimi uygulandi.

## Kesin kok neden (6001 ms)

Credential path tek 6sn deadline icindeydi; onceki surumde primeSqlConnection, session_create ve enrichment ayni butceyi tuketiyordu. DB gecikmesi credential_lookup / credential_verify fazinda birikince deadline tetikleniyordu.

## Degisen dosyalar

- api/_lib/loginPhase.js (yeni)
- api/_lib/handlers/authLogin.js
- api/_lib/customersStore.js
- api/_lib/runSql.js
- api/_lib/routeDeadline.js
- api/_lib/routeTiming.js
- api/_lib/auth.js
- tests/auth-login-phase.test.mjs (yeni)
- tests/auth-login-runtime.test.mjs
- tests/auth-session-runtime.test.mjs
- tests/hotfix-stability.test.mjs
- tests/phone-normalize.test.mjs

## Test / build / lint

| Komut | Sonuc |
|-------|-------|
| npm test | 513/513 pass |
| npm run build | OK (vite ~7.45s) |
| npm run lint | 0 error, 59 warning |

Cikti: AUTH_LOGIN_PHASE_TEST_OUTPUT.txt, AUTH_LOGIN_PHASE_BUILD_OUTPUT.txt, AUTH_LOGIN_PHASE_LINT_OUTPUT.txt

## Mobile build

Baslatilmadi.
