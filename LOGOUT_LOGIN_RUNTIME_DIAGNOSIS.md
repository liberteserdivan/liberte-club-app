# Logout → Tekrar Login Runtime Teşhisi

Amaç: "Çıkış yaptıktan sonra tekrar giriş bazen ~2 dakika sürüyor" belirtisinin
gerçek nedenini koddan uçtan uca çıkarmak ve küçük/hedefli düzeltmeler önermek.

İncelenen dosyalar: `src/lib/session.js`, `src/App.jsx`, `src/pages/LoginPage.jsx`,
`src/hooks/useCommit.js`, `src/lib/apiClient.js`, `src/lib/remoteFetch.js`,
`src/lib/realtimeManager.js`, `src/lib/db.js`, `src/lib/appBootstrap.js`,
`api/_lib/handlers/authLogin.js`, `api/_lib/sqlRequest.js`.

## Akış haritası (mevcut davranış)

1. **Logout** (`handleSetSession(null)` → `logoutSession()`):
   - Yerel temizlik SENKRON ve anında: `memorySession=null`, token sil,
     admin snapshot sil, `clearLocalDb()`. UI hemen login ekranına döner.
   - Sunucu logout'u fire-and-forget (UI'yı bloklamaz).
   - Realtime kapatma + push token deaktivasyonu arka planda (await edilmez).
2. **Login** (`LoginPage.loginWithPin` → `finishSession`):
   - `/api/auth/login` müşteri + loyalty + session döndürür (`buildLoginSuccessBody`).
   - `finishSession` müşteriyi `commit(..., {skipRemote:true})` ile **anında** db'ye yazar,
     sonra `applyAuthResult` + `setSession`. Yani ana ekran tam `/api/state` beklemeden açılır.
3. **Hidrasyon** (`App.jsx`): müşteri zaten login yanıtından geldiği için
   `awaitingCustomer` normalde **false**. Eğer müşteri yoksa 400ms'de `refreshRemote(true)`,
   28sn'de (`CUSTOMER_HYDRATE_MS`) hidrasyon başarısızsa **zorla logout + uyarı**.

## Kontrol listesi sonuçları

| Soru | Bulgu |
|---|---|
| Logout UI server logout'u bekliyor mu? | **Hayır.** Yerel temizlik senkron, sunucu fire-and-forget. |
| Logout sonrası eski polling/realtime/sync timer'ları çalışıyor mu? | useCommit efektleri `sessionCustomerId=null` olunca cleanup ile timer'ı durduruyor; realtime `closeAllRealtimeChannels()` ile kapanıyor. **Timer sızıntısı yok.** |
| Eski token/cookie ile session check döngüsü? | `bootstrapSession` yalnızca mount'ta çalışır, re-login'de tekrar çalışmaz. **Döngü yok.** |
| `clearLocalDb()` app'i kilitliyor mu? | Hayır, tek `localStorage.removeItem`. |
| Login submit'te `/session` + `/login` + `/state` çakışıyor mu? | Login yalnızca `/api/auth/login` çağırır; `/api/state` ertelenir (`INITIAL_REMOTE_SYNC_DELAY_MS=6sn`). **Gereksiz çakışma minimal.** |
| Native/web token ayrımı bozuluyor mu? | `clearNativeAuthToken` tüm legacy anahtarları siler; login yeni token yazar. **Sağlam.** |
| AbortController kullanılmayan eski istekler yeni login'i eziyor mu? | **EVET — risk var (aşağıda kök neden #1).** |
| Safe Mode header / subscribeSafeMode login'i etkiliyor mu? | **EVET — dolaylı risk (kök neden #2/#3).** |

## Kök nedenler (kanıtlı)

### Kök neden #1 — `remoteFetch` backoff'u oturumlar arası taşınıyor (en güçlü aday)
`src/lib/remoteFetch.js` modül seviyesinde `failStreak` / `blockedUntil` tutar.
Sunucu 500/timeout verdiğinde `markRemoteFetchFailure()` ile `/api/state` istekleri
**30sn'ye kadar** `REMOTE_BACKOFF` ile reddedilir. Bu durum **logout/login ile sıfırlanmıyordu**.
Kötü ağ/soğuk DB epizodundan sonra yeniden girişte güncel veri çekimi tekrar tekrar
backoff'a takılır; ardışık başarısız hidrasyon denemeleri (28sn'lik `CUSTOMER_HYDRATE_MS`
zorla-logout'u ile birleşince) kullanıcıyı **login → kısa süre → tekrar login** döngüsüne
sokarak toplamda dakikalarca "giremiyorum" hissi yaratır.

### Kök neden #2 — `/api/state` dedup'ı eski in-flight isteği yeni oturuma taşıyor
`dedupedApiJson` yalnızca `path.startsWith('/api/state')` ile tekilleştiriyordu;
**metot ve oturum farkı gözetmiyordu.** Logout anında uçuşta olan eski oturumun
`/api/state` GET'i, re-login sonrası açılan yeni GET'e **aynı promise olarak** dönebilir →
yeni login state'i eski (muhtemelen 401/bayat) yanıtla **ezilebilir**. Ayrıca POST (kaydet)
isteği uçuştaki bir GET'e bağlanıp **kaydı yutabilir**.

### Kök neden #3 — istemci Safe Mode durumu logout'ta sıfırlanmıyordu
Admin "System Health" panelini açtığında sunucu Safe Mode'u tetikleyebilir; istemci
`x-safe-mode` header'ından bunu öğrenir. Bu durum **logout'ta temizlenmediği** için,
yeni oturumda bir sonraki header gelene kadar polling aralığı genişlemiş (120sn) veya
`fullStatePull` kısıtlı kalabilir → güncel veri gecikmesi.

> Not: `evaluateAndIntervene()` yalnızca admin detaylı sağlık ucunda çalışır; normal
> müşteri akışında Safe Mode otomatik açılmaz. Yani bu, **dolaylı/ikincil** bir faktördür.

## Uygulanan küçük düzeltmeler

- `remoteFetch.js`: `resetRemoteFetchState()` eklendi (backoff + in-flight sıfırlama).
  `/api/state` dedup'ı **yalnızca GET**'e sınırlandı (POST kaydı artık yutulmaz).
- `session.js`: `logoutSession()` ve `applyAuthResult()` içinde `resetRemoteFetchState()`
  çağrılıyor; logout'ta `clearSafeModeState()` ile istemci Safe Mode normale dönüyor.
- `session.js`: sunucu logout timeout'u 8sn → **4sn** (zaten fire-and-forget; sınır daraltıldı).

## Değişmeyen (zaten doğru) davranışlar
- Login yanıtı müşteriyi taşıyor → ilk ekran tam `/api/state` beklemeden açılıyor.
- Timer/realtime cleanup oturum değişiminde zaten yapılıyor.
- Auth uçları soğuk DB için `withSqlRetry` + makul timeout'larla korunuyor.
