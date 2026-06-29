# `/api/auth/login` 500 — Kök Neden (requestId LBT-CB3C02)

Belirti: `POST /api/auth/login` → `500 · 20841ms`, ama kullanıcı profil ekranına
girebiliyor (login fiilen başarılı).

> Not: Vercel log'larına bu ortamdan doğrudan erişim yok; kök neden, ilgili
> requestId'lerin geçtiği kod yolları (authLogin handler + auth.js + runSql.js)
> üzerinden tespit edildi. `LBT-CB3C02` ve `LBT-117862` panelde aramak için
> bırakıldı; aşağıdaki akış bu iki izi açıklıyor.

## Akış (handleAuthLogin)

1. `resolveLoginOutcome` — telefon/PIN okuma + doğrulama (`withSqlRetry`,
   6sn/deneme, 2 retry → ~18sn'ye kadar). res'e bir şey yazmaz.
2. `createSession(res, ...)` — **önce DB INSERT, sonra Set-Cookie** (`auth.js`
   satır 294→305). Yani cookie yalnızca oturum satırı DB'ye yazıldıktan sonra set
   edilir → "hayalet cookie" mümkün değil.
3. `buildLoginSuccessBody` — `findLoyaltyByCustomerId` (DB sorgusu) + realtime
   token imzası → 200 gövdesi.

## Kök neden

Adım 2 başarılı (cookie + DB satırı yazıldı → kullanıcı authenticated, profile
açılıyor). Ancak adım 3'teki **sadakat sorgusu bayat/yavaş bağlantıda hata
fırlatıyor** (veya realtime token üretimi). Bu hata dıştaki `catch`'e düşüyor ve
handler **500** dönüyor — oysa oturum çoktan kurulmuştu.

Sonuç: istemci `500` görüyor ama Set-Cookie + DB oturumu geçerli olduğu için bir
sonraki adımda profile açılıyor. "Login 500 ama kullanıcı içeride" tutarsızlığı
tam olarak budur. ~20sn süre = adım 1'in retry'leri + adım 3'ün yavaş sorgusu.

## Düzeltme

- `buildLoginSuccessBody`: sadakat sorgusu **non-fatal** (try/catch → `loyalty: null`).
- Handler: `createSession` BAŞARILI olduktan sonra gövde üretimi başarısız olsa
  bile **500 dönmez**; minimal başarı gövdesiyle (`buildPlainLoginBody`) **200**
  döner. Hem `success` hem `reuse` yolu korunur.
- `reuse` yolu: zaten geçerli oturum → gövde hatası 500 yapmaz.
- Duplicate login: istemci tarafında in-flight guard (bkz. AUTH_STATE_HOTFIX).
  Ayrıca `reuse` yolu, ikinci bir istek gelse bile mevcut oturumu idempotent
  kullanır (yeni oturum açmaz).

Kabul: oturum oluştuktan sonra `/api/auth/login` artık 500 dönemez.
