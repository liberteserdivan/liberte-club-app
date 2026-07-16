# `/api/state` 401 · 32sn — Kök Neden (requestId LBT-117862)

Belirti: `GET /api/state` → `401 · 32624ms`.

## Yetki kontrolü akışı

`/api/state` GET → `getSessionForBootstrap(req)`:
1. `readAuthToken(req)` — cookie/Authorization yoksa **`if (!token) return null`**
   → DB'ye GİTMEDEN hızlı 401. (Bu yol zaten hızlıydı.)
2. Token VARSA (cookie gönderilmiş ama geçersiz/expired) → `runSqlRead(...)` ile
   `auth_sessions` lookup.

## Kök neden — retry yığını

`runSqlRead`, bayat bağlantıda **`isSqlRequestActive() ? 2 : 4` retry × 6sn
timeout** kullanıyordu. Bağlantı bayatsa her deneme transient hata fırlatıp
yeniden deniyor:

```
en kötü durum ≈ 5 deneme × 6sn ≈ 30sn  →  gözlenen 32624ms
```

Sorgu sağlıklı bağlantıda indeksli ve <1sn'dir; "no row" sonucu retry
TETİKLEMEZ (withSqlRetry yalnızca transient HATADA retry yapar). 32sn tamamen
**bayat bağlantı + yüksek retry sayısı** kaynaklı. Yani yetkisiz bir isteğin
401'i, 30sn boyunca DB'ye yeniden bağlanmaya çalışıyordu.

## Düzeltme

- Yeni `runSqlReadFast`: oturum/auth okumaları için **3sn timeout + 1/2 retry**
  (`runSql.js`). En kötü durumda ~6sn, tipik <1sn.
- `getSession`, `getSessionForBootstrap`, `getSessionForQr` artık `runSqlReadFast`
  kullanıyor. Token yoksa zaten DB'ye gidilmiyor.
- Sonuç: yetkisiz/expired token'da `/api/state` 401'i 32sn yerine fail-fast döner;
  sağlıklı oturum okuması zaten <1sn.

## İstemci tarafı (önceki hotfix ile)

Arka plan `/api/state` 401'i login UI'ı veya auth state'i bozmaz: `App.jsx`
`onUnauthorized` oturum yokken erken döner ve `authEpoch` koruması eski yanıtın
yeni state'i ezmesini engeller (bkz. LOGIN_BACKGROUND_FETCH_HOTFIX_REPORT.md).
