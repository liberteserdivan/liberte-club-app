# AUTH_SESSION_RUNTIME_ROOT_CAUSE

## Ozet

Production `/api/auth/session` gecici DB hatasinda **~10 saniye** bekleyip `503 SESSION_TEMPORARILY_UNAVAILABLE` (`step: session_unavailable`) donuyordu. Kok neden **cift retry katmani** idi.

## Rota izleme

| Adim | Dosya | Aciklama |
|------|-------|----------|
| Rewrite | vercel.json | /api/auth/session -> api/auth.js?action=session |
| Router | api/auth.js | action=session -> handleAuthSession |
| Handler | api/_lib/handlers/authSession.js | GET oturum dogrulama |
| Session lookup | api/_lib/auth.js getSessionForBootstrap | auth_sessions + musteri/loyalty hafif okuma |
| SQL helper | api/_lib/runSql.js | runSqlSessionBootstrap (yeni) |

## SESSION_TEMPORARILY_UNAVAILABLE nerede?

api/_lib/handlers/authSession.js catch blogu: isTransientDbError(e) true ise 503 + session_unavailable + SESSION_TEMPORARILY_UNAVAILABLE.

## ~10 saniye kok nedeni

Eski akis (cift sarmalayici):

1. Dis katman: authSession.js withSqlRetry(getSessionForBootstrap, attemptTimeoutMs: 5000, retries: 1)
2. Ic katman: getSessionForBootstrap icinde runSqlReadFast (3000ms x 2 deneme)

Bayat DB baglantisinda: dis ~5000ms x 2 = ~10s (total_ms ~10060 ile uyumlu).

Token yokken DB'ye gidiliyor; gecersiz oturumda 200 ok:false donuyordu.

## Bootstrap / state

getSessionForBootstrap loadAppState ve syncSessionWithCustomer CAGIRMAZ. Yalnizca session + findCustomerById + findLoyaltyByCustomerId.

## Hedef davranis

| Durum | HTTP | Sure |
|-------|------|------|
| Cookie/token yok | 401 | Aninda |
| Gecersiz oturum | 401 | Hizli lookup |
| Gecici DB | 503 | < 4s |