# Uygulama Atma / Donma / Beyaz Ekran Runtime Teşhisi

İncelenen dosyalar: `src/main.jsx`, `src/components/ErrorBoundary.jsx`,
`src/lib/errorHub.js`, `src/lib/db.js` (localStorage parse), `src/lib/safeMode.js`,
`src/lib/guardianTelemetry.js`, `src/lib/appForeground.js`.

## Mevcut koruma katmanları (zaten var)

| Katman | Durum |
|---|---|
| React `ErrorBoundary` | **Var** — render hatasında beyaz ekran yerine "yeniden dene" ekranı. |
| Global `window.error` | **Var** (`main.jsx`) — `captureException` ile hub'a iletilir. |
| Global `unhandledrejection` | **Var** — `AbortError`/`FETCH_TIMEOUT`/`NETWORK_ERROR` sessizce yutulur (gereksiz toast yok), diğerleri yakalanır. |
| Mount try/catch | **Var** — `createRoot().render` patlarsa inline HTML fallback. |
| localStorage parse | **Güvenli** — `load()` try/catch + bozuk/şişmiş (>2MB) önbelleği atıp seed döner. |
| Safe Mode subscriber | **Güvenli** — `notify()` her dinleyiciyi try/catch ile çağırır. |
| `applySafeModeHeader` | **Güvenli** — `String(header||'')`; bozuk header "off" gibi değerlendirilir, exception atmaz. |

## Bulgu

Kritik bir crash kök nedeni (yakalanmamış exception, parse patlaması, sonsuz render
döngüsü) **tespit edilmedi**; altyapı sağlam. "Atma/kapanma" belirtisinin pratikte
en olası kaynağı, **Logout→Login teşhisindeki** zorla-logout döngüsü (28sn hidrasyon
timeout'u + backoff) ile kullanıcının uygulamayı kapatıp açması olabilir — bu, gerçek
bir native crash değil, **algılanan donma**dır ve o tarafta düzeltildi.

## Uygulanan küçük iyileştirme

- `ErrorBoundary.jsx`: Fallback ekranı kullanıcı dostu metne çevrildi
  (*"Uygulama beklenmeyen bir hata aldı"* + "Yeniden dene") ve `reportError`'dan dönen
  izlenebilir **traceId** ("Hata kodu: ...") gösteriliyor. Bu kod sunucu hata logu ile
  eşleştirme sağlar, **PII içermez**.

## Öneri (bu turda yapılmadı)
- Native foreground/background listener cleanup (`appForeground.js`) zaten `subscribe*`
  ile unsubscribe döndürüyor; ek bir düzeltme gerekmedi.
- İleride: ErrorBoundary'ye "oturumu kapat + önbelleği temizle" seçeneği eklenebilir.
