# Production Grade Stability — Root Cause

## Ozet
Production giris akisinda /api/auth/session uzerinde gorulen Vercel 504 FUNCTION_INVOCATION_TIMEOUT, musteri cekirdeginin agir SQL/Guardian/bootstrap yollarina baglanmasindan kaynaklaniyordu.

## /api/auth/session 504 kok nedeni
1. Token oncesi agir yol riski: Oturum rotasi withSqlRequest + hydrateGuardianState ile Guardian DB hydrate denemesine girebiliyordu.
2. Cift retry + uzun deadline: authSession icinde 9sn deadline + ic runSqlSessionBootstrap birlesince platform limitine yaklasiyordu.
3. Istemci musteri hydrate logout: Gec sync logout tetikliyordu.

## SQL/wrapper/token kontrolu (simdiki)
- api/auth.js: token yoksa DB/getSql/hydrate oncesi aninda 401
- Token varken: withSqlRequestNoGuardian + getSessionForBootstrap + 4sn rota deadline
- Login ve daily-claim Guardian hydrate disinda

## Kalan riskler
- /api/state GET agir okuma yapabilir (skipPersist, yazmasiz)
- Opsiyonel guardian/push timeout musteri girisini bloklamamali
- npm audit 8 moderate (transitive)

Mobil build baslatilmadi.
