# Native API Origin — Yapılandırma Raporu

Bu değişiklik, native (iOS/Android) uygulamanın `app.libertegastrocafe.com`'e **hardcoded
kilitlenmesini** kaldırır ve API kökünü build-time env (`VITE_API_BASE_URL`) ile
yönetilebilir hale getirir. Web/PWA same-origin davranışı **değişmedi**.

> Not: Bu değişiklik login/logout background fetch bug'ını çözmez; o ayrı hotfix
> olarak takip edilir. Buradaki kapsam yalnızca native API kökünün yönetimidir.

## Web/PWA nasıl çalışıyor?

Değişmedi. `resolveApiUrl('/api/...')` web ortamında **relative path** döndürür;
istek tarayıcının bulunduğu origin'e (same-origin) gider. Cookie/CORS/auth
davranışı aynen korunur çünkü istekler hâlâ aynı kökene yapılır.

```js
resolveApiUrl('/api/auth/login', false) // → '/api/auth/login'
```

## Native iOS hangi API base'ini kullanıyor?

`import.meta.env.VITE_API_BASE_URL` → `normalizeApiOrigin(...)` → geçerliyse o
köken; değilse fallback `https://app.libertegastrocafe.com`.

- `capacitor.config.json` → `iosScheme: https` (WebView https kökeninde çalışır).
- Codemagic `ios-release` workflow'unda `VITE_API_BASE_URL` default `https://app.libertegastrocafe.com`.

## Native Android hangi API base'ini kullanıyor?

iOS ile aynı mantık. `CapacitorHttp.enabled: true`. Codemagic `android-release`
workflow'unda `VITE_API_BASE_URL` default `https://app.libertegastrocafe.com`.

## Çözümleme mantığı (`src/lib/apiClient.js`)

```js
const NATIVE_API_ORIGIN =
  normalizeApiOrigin(import.meta.env?.VITE_API_BASE_URL, { allowInsecure: isDevEnv() })
  || 'https://app.libertegastrocafe.com';
```

`normalizeApiOrigin`:
- boş/geçersiz değeri yok sayar (→ fallback),
- `new URL().origin` ile trailing slash ve path'i atar,
- production'da yalnızca `https://` kabul eder,
- yalnızca dev'de `http://localhost` / `http://127.0.0.1`'e izin verir.

`resolveApiUrl(path, native, origin)`:
- absolute URL gelirse olduğu gibi döner,
- native ise `${origin}${normalizedPath}`,
- web ise relative path (same-origin).

## Yeni domain geçişinde hangi env değişecek?

Tek değişken: **`VITE_API_BASE_URL`**.

- Codemagic → ilgili workflow `environment.vars.VITE_API_BASE_URL` değerini güncelle
  (veya Secure env/grup olarak override et), ardından **yeni mobil build al**.
- Web/PWA için bir şey yapmaya gerek yok (same-origin).

## Vercel URL fallback nasıl verilir?

`liberte.cafe` domaini sorunluysa, geçici olarak native build'i Vercel
deployment URL'ine yönlendirmek için:

```
VITE_API_BASE_URL=https://<deployment>.vercel.app
```

değerini Codemagic'te ayarlayıp yeni build alın. (Yalnızca `https://`; trailing
slash otomatik temizlenir.)

## ÖNEMLİ: Domain değişikliği mobil build almadan cihazlara YANSIMAZ

`VITE_API_BASE_URL` **build-time** bir değerdir; native paketin içine gömülür.
Mevcut yüklü uygulamalar bu değeri OTA olarak güncelleyemez. Domain veya Vercel
URL değişikliğinin cihazlara ulaşması için **yeni bir iOS/Android build alıp
mağazaya/TestFlight'a/Play'e dağıtmak zorunludur**.

## Güvenlik

- API kökü açıkça loglanmaz; yalnızca dev ortamında host maskelenmiş şekilde
  bir kez yazılır (`maskApiOrigin`). Production cihazda log yok.
- Secret/token loglanmaz.
- `.env.local`, `.env`, `.env.production` commit edilmedi. `.env.local` içindeki
  `VERCEL_OIDC_TOKEN` gibi değerlerin rotate/revoke edilmesi değerlendirilmeli.

## Doğrulama

- `npm test` → 369 pass / 0 fail (8 yeni native-api-origin testi dahil)
- `npm run build` → başarılı
- `npm run lint` → 0 error (yalnızca önceden var olan 55 uyarı)
- `npm audit` → 8 moderate (firebase-admin transitive, bu değişiklikle ilgisiz)

Çıktılar: `NATIVE_API_ORIGIN_TEST_OUTPUT.txt`, `NATIVE_API_ORIGIN_BUILD_OUTPUT.txt`,
`NATIVE_API_ORIGIN_LINT_OUTPUT.txt`.
