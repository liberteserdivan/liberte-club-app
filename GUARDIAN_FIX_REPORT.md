# GUARDIAN_FIX_REPORT.md

Liberte Guardian — sistem sağlığı, otomatik müdahale ve incident raporlama modülü teslim raporu.

## Ne yapıldı?

### Eklenen dosyalar (server)
- `api/guardian.js` — Guardian API giriş noktası (withSqlRequest + lazy handler).
- `api/_lib/handlers/guardian.js` — yönlendirici (public health + admin-gated health/incidents/safe-mode/report/test-alert/metrics).
- `api/_lib/guardian/guardianConstants.js` — durum seviyeleri, servisler, eşikler, mesajlar.
- `api/_lib/guardian/requestId.js` — `LBT-XXXXXX` requestId üretimi.
- `api/_lib/guardian/guardianMetrics.js` — in-memory ring buffer (son 500 olay), p95/hata oranı/timeout özetleri.
- `api/_lib/guardian/mask.js` — PII/secret maskeleme.
- `api/_lib/guardian/guardianSafeMode.js` — Safe Mode config + TTL.
- `api/_lib/guardian/guardianRouting.js` — URL → servis sınıflandırma.
- `api/_lib/guardian/guardianIncidents.js` — incident dedup/seviye/requiresHuman.
- `api/_lib/guardian/guardianHealth.js` — servis bazlı health (db ping + pasif metrik).
- `api/_lib/guardian/guardianAlerts.js` — admin uyarı kuyruğu + spam guard + best-effort e-posta (Resend).
- `api/_lib/guardian/guardianRules.js` — otomatik güvenli müdahale kuralları (7.1–7.5).
- `api/_lib/guardian/guardianReport.js` — INCIDENT_REPORT / CURSOR_FIX_PROMPT / HEALTH_SNAPSHOT / FAILED_REQUESTS üretimi.

### Eklenen dosyalar (client)
- `src/lib/guardianTelemetry.js` — istemci istek telemetrisi (son 100).
- `src/lib/guardianClient.js` — Guardian endpoint istemcisi.
- `src/lib/safeMode.js` — istemci Safe Mode durumu + davranış getter'ları.
- `src/hooks/useGuardianHealth.js` — admin sağlık polling'i (sayfa aktifken).
- `src/hooks/useGuardianSafeMode.js` — pasif Safe Mode dinleyicisi.
- `src/components/SystemHealthPanel.jsx` — admin "Sistem Sağlığı" ekranı.
- `scripts/sql/006_guardian.sql` — OPSİYONEL kalıcı depolama migration'ı (otomatik uygulanmaz).

### Değiştirilen dosyalar
- `api/_lib/sqlRequest.js` — LBT- requestId + `x-guardian-status`/`x-safe-mode` header + her isteği metrik tamponuna kaydetme.
- `vercel.json` — `api/guardian.js` maxDuration + `/api/guardian/*` rewrite'ları.
- `src/lib/apiClient.js` — `apiJson` içine telemetri kaydı + `x-safe-mode` header senkronu (hata semantiği değişmedi).
- `src/lib/syncPolicy.js` — `safeModeReduced` ile polling aralığı genişletme.
- `src/hooks/useCommit.js` — Safe Mode'da customer full state pull azaltma + polling aralığı.
- `src/pages/AdminPage.jsx` — "Sistem Sağlığı" sekmesi.
- `src/App.jsx` — `setGuardianRole` ile telemetri rolü.
- `src/style.css` — Guardian panel stilleri.
- `tests/login-initial-sync.test.mjs` — yeni (hâlâ ertelenmiş) implementasyona göre güncellendi.

### Yeni endpointler
- `GET /api/guardian/health` (public, sadece durum)
- `GET /api/guardian/health?detailed=1` ve `GET /api/guardian/health/:service` (admin+PIN)
- `GET|POST /api/guardian/incidents` (admin+PIN)
- `GET|POST /api/guardian/safe-mode` (admin+PIN)
- `POST /api/guardian/report` (admin+PIN)
- `POST /api/guardian/test-alert` (admin+PIN)
- `GET /api/guardian/metrics` (admin+PIN)

### Yeni admin ekranı
- AdminPage → "Sistem Sağlığı": genel durum + DB/Login/QR/LP/Realtime/Config kartları, açık incident'lar, son uyarılar, son istekler (istemci), Safe Mode aç/kapat, incident raporu üret (kopyalanabilir), test alert.

### Safe Mode davranışı
- Açıkken: polling reduced, realtime degraded, customer full state pull disabled, admin dashboard refresh reduced, daily claim temporarily disabled, loyalty short timeout, QR/push açık kalır.
- TTL (varsayılan 60 dk) dolunca otomatik kapanır (yeniden değerlendirme).
- Yapamaz: veri silme, LP puanı değişimi, migration, yetki/secret/deploy.

### Incident sistemi
- Seviyeler: healthy / degraded / incident / critical.
- Aynı (alan + başlık) için tek incident güncellenir (dedup, spam yok).
- `requiresHuman` incident/critical'da true; safeActionsTaken kaydedilir; PII maskelenir.

## Bot neyi otomatik çözebilir?
Polling azaltma · realtime degraded · full state pull azaltma · admin dashboard refresh azaltma · daily claim geçici kapatma · LP kısa timeout + "tekrar basmayın" mesajı · kullanıcıya yavaşlık mesajı · admin alert (in-app + best-effort e-posta) · incident kaydı · incident raporu + Cursor fix prompt · QR/LP/login/DB health check.

## Bot neyi otomatik çözmez?
DB migration · production deploy · veri silme · LP puanı düzeltme · admin yetki değişimi · secret/env değişimi · kod refactor/deploy. Bunlar yalnızca rapor + öneri üretir.

## İnsan müdahalesi nasıl anlaşılır?
- Admin panelde Critical/Incident kart + "İnsan müdahalesi gerekiyor" rozeti.
- `requiresHuman: true` (API yanıtı ve incident).
- Admin alert (push/e-posta best-effort) + 15 dk'da bir critical hatırlatma.
- "Incident raporu oluştur" ile `INCIDENT_REPORT.md` + `CURSOR_FIX_PROMPT.md` hazır.

## Komut çıktıları
- `GUARDIAN_TEST_OUTPUT.txt` — **306 test, 306 pass, 0 fail**.
- `GUARDIAN_BUILD_OUTPUT.txt` — `npm run build` başarılı (vite production + testler).
- `GUARDIAN_LINT_OUTPUT.txt` — **0 error, 85 warning** (tamamı önceden var olan stil uyarıları; Guardian dosyaları uyarı üretmiyor).
- `GUARDIAN_AUDIT_OUTPUT.txt` — 8 moderate (önceden var olan, `@google-cloud/storage`/`firebase-admin` transitive bağımlılıkları; bu çalışmayla eklenmedi, düzeltmesi major sürüm yükseltmesi gerektirir = riskli).

## Manuel test planı
1. **Customer login yavaşlık**: Slow 3G'de giriş → kullanıcı teknik hata görmemeli; gecikmede Safe Mode mesajı.
2. **Admin login + PIN**: PIN doğrulanmadan "Sistem Sağlığı" verisi gelmemeli (401/403).
3. **QR açma**: QR tabında generate; yavaşsa "QR oluşturuluyor" mesajı.
4. **LP action**: kasada LP; "LP işleniyor, tekrar basmayın"; çift tık engellenir.
5. **Offline/Slow 3G**: network error telemetriye düşer (`getRecentRequests`).
6. **DB yavaş simülasyonu**: DB p95 > 3000ms birkaç kez → Safe Mode + incident + admin alert.
7. **Safe Mode aç/kapat**: admin panelden; polling aralığı genişler, customer full pull azalır; kapatınca normale döner.
8. **Incident raporu kopyalama**: "Incident raporu oluştur" → metin kopyalanır; içinde secret/PII yok.

## Güvenlik / sınırlar
- Public health hassas detay vermez; detay/incidents/safe-mode admin+PIN.
- Raporlarda secret (DB URL, JWT, private key, service account) ve müşteri PII maskelenir.
- v1 bellek tabanlı; kalıcılık için opsiyonel `scripts/sql/006_guardian.sql` (manuel, additive, rollback notlu).

## Kabul kriterleri durumu
- [x] Admin Login/QR/LP/DB durumunu görebiliyor.
- [x] Her API hatasında LBT- requestId oluşuyor (header + body).
- [x] LP/QR/Login yavaşlığı incident olarak algılanıyor (kurallar 7.1–7.5).
- [x] Güvenli aksiyonlar otomatik uygulanıyor (Safe Mode + polling/realtime/refresh azaltma).
- [x] Çözülemeyen sorunda `requiresHuman: true` + admin alert.
- [x] Incident raporu + Cursor fix prompt üretilebiliyor.
- [x] Normal kullanıcı teknik detay görmüyor.
- [x] Secret/PII raporlara sızmıyor (maskeleme + test).
- [x] `npm test`, `npm run build`, `npm run lint` başarılı.
