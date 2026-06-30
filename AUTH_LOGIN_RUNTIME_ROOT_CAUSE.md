# AUTH Login Runtime — Root Cause

## Belirti
POST /api/auth/login -> 503 LOGIN_TEMPORARILY_UNAVAILABLE
UI: "Giris su an tamamlanamiyor" (Ref: requestId)

## Kok neden
1. resolveLoginOutcome icinde getSession(req) cagriliyordu.
   getSession -> syncSessionWithCustomer -> loadAppState (agir legacy okuma).
2. withSqlRetry(6000ms x 2 retry) kimlik dogrulama yolunu ~18sn'ye uzatabiliyordu.
3. createSession runSql retry ile cift session satiri riski tasiyordu.
4. Rate-limit DB gecici hatasi login'i fail-open olmadan etkileyebiliyordu.

## DB cagri zinciri (onceki)
login -> getSession -> syncSessionWithCustomer -> loadAppState
login -> findCustomerByPhone -> runSql + repair + loadAppState fallback
login -> withSqlRetry(resolveLoginOutcome) -> verifyCustomerPin
login -> createSession -> runSql INSERT (retry)

## DB cagri zinciri (simdiki)
login -> getSessionIdentityForLogin (hafif SELECT, loadAppState YOK)
login -> findByPhoneSql (customersStore, tek tablo)
login -> hasCustomerPinAuth + verifyCustomerPin
login -> runSqlLoginRead (2.5sn x 1 retry, ~5sn max)
login -> createSessionOnce (tek INSERT, retry YOK)
login -> buildLoginSuccessBody (loyalty/realtime best-effort)

Mobil build baslatilmadi.
