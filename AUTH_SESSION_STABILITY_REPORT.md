# Auth / Session Stability Report

## Problem
`GET /api/auth/session` gerçek cihazda ~18sn sonra **500** dönüyordu ve login döngüsünü
kırıyordu (`LBT-6AD6E5`, `LBT-E8F8CC`, `LBT-087678`).

## Kök neden
1. `getSessionForBootstrap` → `runSql` (attempt-timeout YOK). Bayat pooler bağlantısında
   SQL okuma sınırsız bekliyordu.
2. `authSession.js` GET sarmalayıcısı `attemptTimeoutMs:6000, retries:2` ile her denemeyi
   6sn'de kesiyordu → 3×6sn = ~18sn → sonra `catch` bloğu **500** dönüyordu.

## Düzeltme
- `api/_lib/auth.js`
  - `getSession`, `getSessionForBootstrap`, `getSessionForQr`: `runSql` → **`runSqlRead`**
    (her deneme 6sn ile sınırlı; salt-okunur, rol UPDATE'i idempotent).
- `api/_lib/handlers/authSession.js`
  - GET attempt: `attemptTimeoutMs:5000, retries:1` → en kötü ~10sn (18sn değil).
  - Transient DB hatasında **HTTP 503** + `SESSION_TEMPORARILY_UNAVAILABLE`:
    ```
    if (isTransientDbError(e)) → 503 SESSION_TEMPORARILY_UNAVAILABLE
    ```
  - İstemci bu durumda login ekranına döner; sonsuz 500 döngüsü oluşmaz.

## Eşzamanlılık
- Bootstrap session probe salt-okunur ve hızlı; login submit `AUTH_REQUEST_OPTIONS` ile
  ayrı uçtan gider. Session probe artık 5-10sn'de sonuçlandığı için login submit'i
  uzun süre "ezme" penceresi ortadan kalkar.
- `/api/state` istemci tarafında GET-bazlı dedup ediliyor (`remoteFetch.dedupedApiJson`),
  ardışık session/state istek seli engelleniyor.

## Test
- `tests/emergency-stability.test.mjs`:
  - `connection terminated` ve `ETIMEDOUT attempt timeout` → `isTransientDbError === true`
    (yani 503 yoluna girer).
  - `getSessionForBootstrap` export doğrulaması.
- Mevcut `tests/hotfix-stability.test.mjs` logout timeout / reset davranışlarını korur.

## Kabul
- ✅ DB timeout senaryosunda kısa sürede 503 döner (18sn 500 değil).
- ✅ Session probe login state'ini ezmez (ayrı uç + hızlı sonuç).
- ✅ Tekrar eden 18sn 500 döngüsü ortadan kalkar.
