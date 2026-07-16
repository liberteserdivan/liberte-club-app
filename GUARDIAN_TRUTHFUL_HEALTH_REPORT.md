# Guardian Truthful Health Report

## Problem
Panelde servis kartları yeşil ("Sağlıklı") gösterilirken, altta son istek özetinde
65 hata / 30 timeout vardı. Bu kabul edilemez bir yanlış raporlamaydı.

## Kök neden
`SystemHealthPanel` yalnızca **server** `checkOverall()` çıktısına bakıyordu. Server,
serverless instance belleğinde sınırlı metrikle çalıştığı ve cihazın yaşadığı
504/ERR/timeout'lar farklı instance'larda olabildiği için, server "healthy" diyebiliyordu.
İstemcinin kendi telemetrisi (gerçek kullanıcı deneyimi) severity'ye hiç katılmıyordu.

## Düzeltme
### Yeni saf modül: `src/lib/clientHealthSeverity.js`
`deriveClientHealth(samples)` — son 20 client isteğinden severity + incident üretir:
- Hata oranı > %20 → en az **degraded**
- Herhangi bir timeout > 0 → **incident** (etkilenen alan)
- `/api/auth/session` 500 → **auth incident**
- `/api/realtime` 10sn+ veya ERR → **realtime incident**
- `/api/guardian/health` 10sn+ veya 504 → **config (guardian) incident**
- `/api/push/register-device` 504 → **push degraded** (auth/login'i bozmaz)
- Hata oranı ≥ %50 (≥5 örnek) → **critical**

### Panel: `src/components/SystemHealthPanel.jsx`
- Genel durum = `worstSeverity(serverOverall, clientHealth.severity)`.
- Servis kartı = `worst(serverStatus, clientStatusForService(...))` → client incident
  varsa kart yeşil kalmaz.
- "Son Incident'lar" listesine **client-only** incident'lar eklenir; bunlar "Kaynak:
  cihaz telemetrisi" etiketiyle gösterilir (resolve butonu yok, server kaydı değil).
- Guardian health timeout durumunda server zaten "degraded" döndüğü için (bkz.
  `withHealthDeadline`), kart "Sağlıklı" değil "Yavaş/Kritik" gösterir.

## Test
`tests/emergency-stability.test.mjs`
- Kullanıcının verdiği gerçek telemetry örneğiyle overall `healthy` DEĞİL; auth+realtime+
  config+push incident'ları üretilir.
- 65 hata yoğunluğu (≥%50) → `critical`.
- Temiz telemetri → `healthy`.
- Push 504 tek başına auth incident üretmez (sadece push degraded).

## Kabul
- ✅ Verilen telemetry örneğiyle overall healthy olmaz.
- ✅ 65 hata / 30 timeout varsa kartlar yeşil kalmaz.
- ✅ Client-only incident listede görünür.
