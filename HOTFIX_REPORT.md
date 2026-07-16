# Acil Stabilite Hotfix Raporu

Hedef: Gerçek kullanımda bozuk olan **logout→login** ve **günlük LP** akışlarını
küçük/hedefli düzeltmelerle onarmak. Yeni özellik, Guardian Autopilot, Approval Center,
DB migration otomasyonu veya büyük refactor **yapılmadı.**

## Değiştirilen dosyalar (küçük, hedefli)

| Dosya | Değişiklik |
|---|---|
| `src/lib/remoteFetch.js` | `resetRemoteFetchState()` eklendi; `/api/state` dedup'ı yalnızca **GET**'e sınırlandı (POST kaydı yutulmaz). |
| `src/lib/safeMode.js` | `clearSafeModeState()` eklendi (durumu sıfırlar, dinleyiciler korunur). |
| `src/lib/session.js` | `logoutSession()`: ağ + Safe Mode durumunu sıfırlar; sunucu logout timeout 8sn→**4sn**. `applyAuthResult()`: yeni oturumda ağ durumunu sıfırlar. |
| `api/_lib/dbTransient.js` | `isUndefinedTableError()` eklendi (42P01 / "relation ... does not exist"). |
| `api/_lib/handlers/customerLoyaltyClaim.js` | Tablo eksikse **503 + `DAILY_CLAIMS_TABLE_MISSING`** net mesajı + Guardian incident. |
| `src/components/ErrorBoundary.jsx` | Kullanıcı dostu hata ekranı + izlenebilir `traceId`. |
| `tests/hotfix-stability.test.mjs` | 9 yeni birim test. |

## Kök nedenler ve çözümler

1. **Oturumlar arası taşınan ağ backoff'u** (`failStreak`/`blockedUntil`) yeniden
   girişte `/api/state`'i 30sn'ye kadar reddedip hidrasyon timeout'u ile zorla-logout
   döngüsü yaratıyordu → **logout/login'de reset** edildi.
2. **`/api/state` dedup'ı metot/oturum gözetmiyordu** → eski in-flight GET yeni login'i
   ezebiliyor, POST kaydı yutulabiliyordu → **GET-only dedup** + oturum geçişinde reset.
3. **İstemci Safe Mode durumu logout'ta kalıyordu** → yeni oturumda polling/pull
   gereksiz kısıtlanabiliyordu → **logout'ta reset**.
4. **`daily_claims` tablosu eksikse** ham DB hatası dönüyordu → **net 503 kod** +
   admin'e Guardian incident.

## Doğrulama (komut çıktıları)

| Komut | Sonuç | Çıktı dosyası |
|---|---|---|
| `npm test` | **341/341 geçti** (0 fail) | `HOTFIX_TEST_OUTPUT.txt` |
| `npm run build` | **Başarılı** (vite build + test) | `HOTFIX_BUILD_OUTPUT.txt` |
| `npm run lint` | **0 hata**, 55 uyarı (hepsi önceden var; yeni kodda uyarı yok) | `HOTFIX_LINT_OUTPUT.txt` |
| `npm audit` | 8 orta seviye (tümü `firebase-admin` transitive; Firebase upgrade kapsam dışı) | `HOTFIX_AUDIT_OUTPUT.txt` |

## Kabul kriterleri kontrolü

- [x] Logout sonrası tekrar login 2 dakika sürmez (backoff/dedup/safe-mode reset).
- [x] Logout UI'ı server logout takılınca kilitlenmez (fire-and-forget, 4sn).
- [x] Logout sonrası eski polling/realtime/sync timer kalmaz (mevcut cleanup + reset).
- [x] Tekrar login eski `/api/state`/in-flight tarafından ezilmez (GET-only dedup + reset).
- [x] Daily LP çalışır; tablo eksikse net `DAILY_CLAIMS_TABLE_MISSING` mesajı verir.
- [x] daily_claims migration eksikse admin Guardian incident'inde görür.
- [x] Safe Mode login/QR/LP/daily claim ana akışını bozmaz (otomatik tetik yalnızca admin sağlık ucu).
- [x] Crash'te beyaz ekran yerine yakalanabilir hata ekranı + traceId.
- [x] Build/test geçti.
- [x] Hiçbir secret/PII loglanmadı.

## Bu turda kasıtlı YAPILMAYANLAR
Guardian Autopilot/Approval ekleme, DB migration otomasyonu, Firebase upgrade,
yeni UI tasarımı, LP elle düzeltme, müşteri verisi silme, production env/secret değişikliği.

## Operasyon notu
Üretimde günlük LP hâlâ çalışmıyorsa, claim isteği `503 DAILY_CLAIMS_TABLE_MISSING`
dönüyorsa: `scripts/sql/001_normalized_schema.sql` + `scripts/sql/005_daily_claims_dedup.sql`
migration'larını **manuel** uygulayın (otomatik uygulanmaz).
